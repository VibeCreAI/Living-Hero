use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;

const OLLAMA_PORT: u16 = 11434;
const DEFAULT_MODEL: &str = "alibayram/smollm3";
const STARTUP_TIMEOUT_SECS: u64 = 60;

#[derive(Default)]
pub struct OllamaState {
    pub pid: Option<u32>,
    pub port: u16,
    pub status: OllamaStatus,
}

#[derive(Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OllamaStatus {
    #[default]
    Starting,
    PullingModel,
    Connected,
    Offline,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullProgress {
    pub status: String,
    pub completed: u64,
    pub total: u64,
}

impl OllamaState {
    pub fn new() -> Self {
        Self {
            pid: None,
            port: OLLAMA_PORT,
            status: OllamaStatus::Starting,
        }
    }
}

fn emit_status(handle: &AppHandle, status: OllamaStatus) {
    if let Ok(state) = handle.state::<Mutex<OllamaState>>().lock() {
        // We need to drop the lock before emitting, so clone status
        drop(state);
    }
    // Update state
    if let Ok(mut state) = handle.state::<Mutex<OllamaState>>().lock() {
        state.status = status;
    }
    let _ = handle.emit("ollama-status", status);
}

async fn check_ollama_running() -> bool {
    let url = format!("http://localhost:{}/api/tags", OLLAMA_PORT);
    match reqwest::get(&url).await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

async fn wait_for_ready(_handle: &AppHandle, timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    loop {
        if check_ollama_running().await {
            return true;
        }
        if start.elapsed().as_secs() >= timeout_secs {
            return false;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    // Suppress "unreachable" — the loop always returns inside
}

async fn model_exists(model: &str) -> bool {
    let url = format!("http://localhost:{}/api/tags", OLLAMA_PORT);
    match reqwest::get(&url).await {
        Ok(resp) => {
            if let Ok(body) = resp.json::<serde_json::Value>().await {
                if let Some(models) = body["models"].as_array() {
                    return models.iter().any(|m| {
                        m["name"]
                            .as_str()
                            .map(|n| n.starts_with(model))
                            .unwrap_or(false)
                    });
                }
            }
            false
        }
        Err(_) => false,
    }
}

async fn pull_model_with_progress(handle: &AppHandle, model: &str) -> Result<(), String> {
    emit_status(handle, OllamaStatus::PullingModel);

    let url = format!("http://localhost:{}/api/pull", OLLAMA_PORT);
    let client = reqwest::Client::new();

    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "name": model, "stream": false }))
        .timeout(std::time::Duration::from_secs(3600))
        .send()
        .await
        .map_err(|e| format!("Pull request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Pull failed with status: {}", resp.status()));
    }

    // Non-streaming pull completed
    let _ = handle.emit(
        "model-pull-progress",
        PullProgress {
            status: "success".to_string(),
            completed: 100,
            total: 100,
        },
    );

    Ok(())
}

pub async fn start_ollama(handle: &AppHandle) {
    emit_status(handle, OllamaStatus::Starting);

    // 1. Check if Ollama already running
    if check_ollama_running().await {
        println!("[ollama] Found existing Ollama instance on port {}", OLLAMA_PORT);
        ensure_model(handle).await;
        emit_status(handle, OllamaStatus::Connected);
        return;
    }

    // 2. Try to spawn sidecar
    println!("[ollama] Starting Ollama sidecar...");
    match handle.shell().sidecar("ollama") {
        Ok(cmd) => {
            match cmd.args(["serve"]).spawn() {
                Ok((_rx, child)) => {
                    let pid = child.pid();
                    println!("[ollama] Sidecar started with PID: {}", pid);

                    if let Ok(mut state) = handle.state::<Mutex<OllamaState>>().lock() {
                        state.pid = Some(pid);
                    }

                    // 3. Wait for server to be ready
                    if wait_for_ready(handle, STARTUP_TIMEOUT_SECS).await {
                        println!("[ollama] Server ready on port {}", OLLAMA_PORT);
                        ensure_model(handle).await;
                        emit_status(handle, OllamaStatus::Connected);
                    } else {
                        println!("[ollama] Server failed to start within {}s", STARTUP_TIMEOUT_SECS);
                        emit_status(handle, OllamaStatus::Offline);
                    }
                }
                Err(e) => {
                    println!("[ollama] Failed to spawn sidecar: {} (dev mode?)", e);
                    println!("[ollama] Checking for manual Ollama instance...");

                    if wait_for_ready(handle, 5).await {
                        println!("[ollama] Found manual Ollama instance");
                        ensure_model(handle).await;
                        emit_status(handle, OllamaStatus::Connected);
                    } else {
                        println!("[ollama] No Ollama instance found. AI will use fallback brain.");
                        emit_status(handle, OllamaStatus::Offline);
                    }
                }
            }
        }
        Err(e) => {
            println!("[ollama] Sidecar not available: {}", e);
            // In dev mode, developer runs ollama manually
            println!("[ollama] Waiting for manual Ollama instance...");

            if wait_for_ready(handle, 5).await {
                println!("[ollama] Found manual Ollama instance");
                ensure_model(handle).await;
                emit_status(handle, OllamaStatus::Connected);
            } else {
                println!("[ollama] No Ollama instance found. AI will use fallback brain.");
                emit_status(handle, OllamaStatus::Offline);
            }
        }
    }
}

async fn ensure_model(handle: &AppHandle) {
    if model_exists(DEFAULT_MODEL).await {
        println!("[ollama] Model '{}' already available", DEFAULT_MODEL);
        return;
    }

    println!("[ollama] Model '{}' not found, pulling...", DEFAULT_MODEL);
    match pull_model_with_progress(handle, DEFAULT_MODEL).await {
        Ok(()) => println!("[ollama] Model '{}' pulled successfully", DEFAULT_MODEL),
        Err(e) => println!("[ollama] Failed to pull model: {}", e),
    }
}

pub fn shutdown_ollama(handle: &AppHandle) {
    let pid = {
        let state = handle.state::<Mutex<OllamaState>>();
        state.lock().ok().and_then(|s| s.pid)
    };

    if let Some(pid) = pid {
        println!("[ollama] Shutting down Ollama (PID: {})", pid);

        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .output();
        }

        println!("[ollama] Shutdown signal sent");
    }
}

// --- Tauri commands callable from frontend ---

#[tauri::command]
pub async fn get_ollama_status(
    state: tauri::State<'_, Mutex<OllamaState>>,
) -> Result<String, String> {
    let status = state
        .lock()
        .map_err(|e| e.to_string())?
        .status;

    let status_str = match status {
        OllamaStatus::Starting => "starting",
        OllamaStatus::PullingModel => "pulling_model",
        OllamaStatus::Connected => "connected",
        OllamaStatus::Offline => "offline",
    };

    Ok(status_str.to_string())
}

#[tauri::command]
pub async fn pull_ollama_model(
    handle: AppHandle,
    model: String,
) -> Result<(), String> {
    pull_model_with_progress(&handle, &model).await
}
