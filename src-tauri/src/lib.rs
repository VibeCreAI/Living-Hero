mod ollama;

use ollama::{OllamaState, get_ollama_status, pull_ollama_model, shutdown_ollama, start_ollama};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(OllamaState::new()))
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                start_ollama(&handle).await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                shutdown_ollama(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_ollama_status,
            pull_ollama_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Living Heros");
}
