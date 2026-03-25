# Living Heros --- Prompt #00: Tauri Desktop Wrapper + Ollama Sidecar

## CONTEXT

Living Heros is a Phaser 3 + React + TypeScript + Vite web game that
needs to ship as a **desktop application** with a bundled local LLM
server (Ollama). This prompt sets up the Tauri wrapper BEFORE game
development continues, so all subsequent work builds on the proper
desktop foundation.

Current project state:
- Working Vite + Phaser 3 + React game (Prototype 0)
- Vite dev server on port 8080
- No desktop wrapper yet
- No LLM server integration yet

Reference implementation: **VibeTube** (same developer's Tauri + sidecar
project at `C:\Users\samso\OneDrive\Desktop\Vibe\Web\VibeTube`)

---

## DOCUMENT PRIORITY (MANDATORY)

1. **TDD** → architecture and contracts (STRICT)
2. **PRD** → scope and vision
3. **GDD** → gameplay feel
4. This prompt → execution

If conflict exists → follow **TDD**.

---

## GOAL

Wrap the existing Phaser/React/Vite game in a **Tauri 2** desktop
application that:
- Runs the existing Vite frontend unchanged in a native webview
- Bundles **Ollama** as a sidecar binary (auto-launched with the game)
- Auto-pulls the LLM model on first launch (with progress feedback)
- Manages Ollama lifecycle (start, health check, shutdown)
- Works seamlessly in both dev mode and production builds

---

## CRITICAL RULES

### 1. FRONTEND UNCHANGED

- Phaser + React + Vite setup remains 100% as-is
- Tauri wraps the existing `dist/` output (prod) or `localhost:8080` (dev)
- No changes to game code, components, or build config
- Vite remains the frontend build tool

### 2. SIDECAR PATTERN

- Ollama binary bundled as a Tauri external binary (sidecar)
- Launched automatically when the app starts
- Shut down cleanly when the app closes
- Process lifecycle managed in Rust (like VibeTube's vibetube-server)

### 3. MODEL MANAGEMENT

- On first launch: auto-pull default model (`phi3.5` or configured model)
- Show download progress to the user via Tauri events → React UI
- Cache model locally (Ollama default cache directory)
- Skip pull if model already cached

### 4. DEV MODE

- `bun run tauri dev` → starts Vite on port 8080 + opens Tauri window
- Developer runs `ollama serve` manually (or Tauri starts it)
- Dev sidecar placeholder so Tauri compiles without bundled binary

---

# IMPLEMENTATION STEPS

## STEP 1 --- INSTALL TAURI 2 CLI & DEPENDENCIES

### Prerequisites

- Rust toolchain (rustup + cargo)
- Tauri 2 CLI: `cargo install tauri-cli --version "^2"`
- Platform build tools (Visual Studio 2022 C++ on Windows)

### Initialize Tauri in Project

```bash
# From project root (living-heros/)
cargo tauri init
```

Configuration during init:
- App name: `Living Heros`
- Window title: `Living Heros`
- Frontend dev URL: `http://localhost:8080`
- Frontend build command: `bun run build` (or `npm run build`)
- Frontend dev command: `bun run dev` (or `npm run dev`)
- Frontend dist directory: `../dist`

This creates `src-tauri/` directory with:
- `Cargo.toml` (Rust dependencies)
- `tauri.conf.json` (app configuration)
- `src/main.rs` (Rust entry point)

---

## STEP 2 --- TAURI CONFIGURATION

### `src-tauri/tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Living Heros",
  "version": "0.1.0",
  "identifier": "ai.vibecreai.living-heros",
  "build": {
    "beforeDevCommand": "bun run dev-nolog",
    "beforeBuildCommand": "bun run build-nolog",
    "frontendDist": "../dist",
    "devUrl": "http://localhost:8080"
  },
  "bundle": {
    "active": true,
    "targets": "nsis",
    "externalBin": ["binaries/ollama"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.ico"
    ]
  },
  "app": {
    "security": {
      "csp": null,
      "capabilities": ["default"]
    },
    "windows": [
      {
        "title": "Living Heros",
        "width": 1024,
        "height": 768,
        "minWidth": 1024,
        "minHeight": 768,
        "resizable": true,
        "fullscreen": false,
        "devtools": true
      }
    ],
    "withGlobalTauri": true
  },
  "plugins": {
    "shell": {
      "open": true
    }
  }
}
```

Key points:
- `beforeDevCommand`: use `dev-nolog` to avoid log.js conflicts with Tauri
- `devUrl`: matches Vite port 8080
- `externalBin`: bundles Ollama binary as sidecar
- Window size: 1024x768 (matches Phaser canvas)

---

## STEP 3 --- RUST DEPENDENCIES

### `src-tauri/Cargo.toml`

Add required dependencies:

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open", "shell-execute", "shell-sidecar"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json"] }
```

---

## STEP 4 --- OLLAMA SIDECAR MANAGEMENT (RUST)

### `src-tauri/src/main.rs`

Core responsibilities (modeled after VibeTube's `main.rs`):

```rust
use std::sync::Mutex;
use tauri::Manager;

struct OllamaState {
    pid: Option<u32>,
    port: u16,
    available: bool,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(OllamaState {
            pid: None,
            port: 11434,
            available: false,
        }))
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
            pull_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Startup Flow

```rust
async fn start_ollama(handle: &tauri::AppHandle) {
    // 1. Check if Ollama already running on port 11434
    if check_port_in_use(11434).await {
        // Reuse existing Ollama instance
        emit_status(handle, "connected");
        return;
    }

    // 2. Spawn Ollama sidecar
    let sidecar = handle.shell()
        .sidecar("ollama")
        .unwrap()
        .args(["serve"])
        .spawn()
        .expect("Failed to start Ollama");

    // 3. Store PID for cleanup
    let state = handle.state::<Mutex<OllamaState>>();
    let mut state = state.lock().unwrap();
    state.pid = Some(sidecar.pid());

    // 4. Wait for Ollama to be ready (poll health endpoint)
    wait_for_ready(handle, 60).await;

    // 5. Check if default model is available, pull if not
    ensure_model(handle, "phi3.5").await;
}
```

### Shutdown

```rust
fn shutdown_ollama(handle: &tauri::AppHandle) {
    let state = handle.state::<Mutex<OllamaState>>();
    let state = state.lock().unwrap();

    if let Some(pid) = state.pid {
        // Windows: taskkill /PID {pid} /T /F
        // Unix: kill -TERM {pid}
        kill_process_tree(pid);
    }
}
```

### Tauri Commands (callable from frontend)

```rust
#[tauri::command]
async fn get_ollama_status(state: tauri::State<'_, Mutex<OllamaState>>) -> Result<String, String> {
    // Returns "connected", "starting", "offline", "pulling_model"
}

#[tauri::command]
async fn pull_model(
    handle: tauri::AppHandle,
    model: String
) -> Result<(), String> {
    // POST to Ollama API: /api/pull
    // Stream progress events to frontend
    // handle.emit("model-pull-progress", { status, completed, total })
}
```

---

## STEP 5 --- DEV SIDECAR PLACEHOLDER

### `scripts/setup-dev-sidecar.js`

In dev mode, Tauri needs a sidecar binary to exist at compile time.
Create a placeholder (like VibeTube does):

```js
// Creates a minimal placeholder binary so Tauri compiles in dev mode.
// In dev, the developer runs `ollama serve` manually.

const fs = require('fs');
const path = require('path');
const os = require('os');

const binDir = path.join(__dirname, '..', 'src-tauri', 'binaries');
fs.mkdirSync(binDir, { recursive: true });

const platform = os.platform();
const arch = os.arch();
// Tauri sidecar naming: binary-{target_triple}
const targetTriple = getTargetTriple(platform, arch);
const ext = platform === 'win32' ? '.exe' : '';
const filename = `ollama-${targetTriple}${ext}`;

if (platform === 'win32') {
  // Create minimal valid PE executable
  const pe = createMinimalPE();
  fs.writeFileSync(path.join(binDir, filename), pe);
} else {
  // Create shell script placeholder
  fs.writeFileSync(
    path.join(binDir, filename),
    '#!/bin/sh\necho "Dev placeholder - run ollama serve manually"\nexit 1\n'
  );
  fs.chmodSync(path.join(binDir, filename), 0o755);
}

console.log(`Created dev sidecar placeholder: ${filename}`);
```

Add to package.json scripts:
```json
{
  "scripts": {
    "setup-sidecar": "node scripts/setup-dev-sidecar.js",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

---

## STEP 6 --- BUNDLE OLLAMA FOR PRODUCTION

### `scripts/bundle-ollama.js`

Downloads the official Ollama binary for the target platform and places
it in `src-tauri/binaries/` with the correct Tauri naming convention:

```js
// Downloads Ollama binary from official releases for bundling.
// Run before `tauri build` for production packaging.

const OLLAMA_VERSION = '0.6.2'; // Pin to tested version
const DOWNLOAD_URLS = {
  'x86_64-pc-windows-msvc': `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-windows-amd64.exe`,
  'x86_64-apple-darwin': `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin`,
  'aarch64-apple-darwin': `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin`,
  'x86_64-unknown-linux-gnu': `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-linux-amd64`,
};

// 1. Determine target triple
// 2. Download binary from GitHub releases
// 3. Save as src-tauri/binaries/ollama-{target_triple}[.exe]
// 4. Set executable permissions (Unix)
```

---

## STEP 7 --- FRONTEND OLLAMA STATUS HOOK

### `src/hooks/useOllamaStatus.ts`

React hook that communicates with Tauri backend for Ollama status:

```ts
import { useState, useEffect } from 'react';

type OllamaStatus = 'starting' | 'pulling_model' | 'connected' | 'offline';

interface PullProgress {
  status: string;
  completed: number;
  total: number;
}

export function useOllamaStatus() {
  const [status, setStatus] = useState<OllamaStatus>('starting');
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);

  useEffect(() => {
    // If running in Tauri (window.__TAURI__):
    //   - Listen for 'ollama-status' events from Rust
    //   - Listen for 'model-pull-progress' events
    // If running in browser (dev without Tauri):
    //   - Poll localhost:11434 health endpoint directly
    //   - Assume model is available
  }, []);

  return { status, pullProgress };
}
```

### `src/app/react/components/hud/ModelDownloadOverlay.tsx`

Full-screen overlay shown during first-launch model download:

```
┌──────────────────────────────────────────┐
│                                          │
│           Living Heros                   │
│                                          │
│    Downloading Hero AI Brain...          │
│    ████████████░░░░░░░░  58%             │
│    1.3 GB / 2.2 GB                       │
│                                          │
│    This only happens once.               │
│                                          │
└──────────────────────────────────────────┘
```

---

## STEP 8 --- UPDATE PACKAGE.JSON

Add Tauri-related scripts:

```json
{
  "scripts": {
    "dev": "vite --config vite/config.dev.mjs",
    "build": "vite build --config vite/config.prod.mjs",
    "dev-nolog": "vite --config vite/config.dev.mjs",
    "build-nolog": "vite build --config vite/config.prod.mjs",
    "setup-sidecar": "node scripts/setup-dev-sidecar.js",
    "bundle-ollama": "node scripts/bundle-ollama.js",
    "tauri:dev": "tauri dev",
    "tauri:build": "npm run bundle-ollama && tauri build"
  }
}
```

Dev workflow:
```bash
# Terminal 1: Start Ollama manually
ollama serve

# Terminal 2: Start Tauri dev (launches Vite + Tauri window)
bun run tauri:dev
```

Or without Tauri (pure web dev):
```bash
ollama serve        # Terminal 1
bun run dev         # Terminal 2 (opens in browser)
```

---

## PROJECT STRUCTURE (NEW FILES)

```
living-heros/
  src-tauri/                    ← Tauri desktop app (NEW)
    Cargo.toml                  ← Rust dependencies
    tauri.conf.json             ← App config (window, sidecar, build)
    src/
      main.rs                   ← Ollama sidecar lifecycle management
      ollama.rs                 ← Ollama process + model management
    binaries/                   ← Sidecar binaries (dev placeholder / prod Ollama)
    icons/                      ← App icons

  scripts/                      ← Build scripts (NEW)
    setup-dev-sidecar.js        ← Creates dev placeholder binary
    bundle-ollama.js            ← Downloads Ollama for production build

  src/hooks/                    ← React hooks (NEW)
    useOllamaStatus.ts          ← Ollama status from Tauri backend

  src/app/react/components/hud/
    ModelDownloadOverlay.tsx     ← First-launch model download UI (NEW)
```

---

## DEV VS PROD FLOW

### Development

```
Developer runs `ollama serve` manually
  ↓
`bun run tauri:dev` (or `bun run dev` for browser-only)
  ↓
Tauri opens webview → Vite dev server (localhost:8080)
  ↓
Game connects to Ollama at localhost:11434
```

### Production

```
User installs Living Heros (NSIS installer)
  ↓
App launches → Tauri starts → spawns Ollama sidecar
  ↓
First launch: auto-pulls model (progress overlay shown)
  ↓
Ollama ready → game connects at localhost:11434
  ↓
App closes → Tauri kills Ollama process
```

---

## WHAT NOT TO BUILD

- No custom model training or fine-tuning
- No cloud fallback (local only)
- No auto-updater for Ollama (pin to tested version)
- No model selection UI (configured in aiConfig.ts)
- No macOS/Linux packaging yet (Windows NSIS first, expand later)

---

## IMPLEMENTATION PRIORITY

1. Install Tauri 2 CLI + init project structure
2. Configure `tauri.conf.json` for existing Vite setup
3. Create dev sidecar placeholder script
4. Write Rust `main.rs` with Ollama sidecar management
5. Add `useOllamaStatus` React hook
6. Add `ModelDownloadOverlay` component
7. Create `bundle-ollama.js` production script
8. Test dev workflow: `bun run tauri:dev`
9. Test production build: `bun run tauri:build`
10. Update package.json scripts

---

## SUCCESS CRITERIA

- `bun run tauri:dev` opens the game in a native window (Vite hot-reload works)
- `bun run dev` still works for browser-only development
- Ollama sidecar starts automatically with the app
- First launch pulls model with progress feedback
- Subsequent launches skip model download (cached)
- App shutdown cleanly kills Ollama process
- Production build creates installable NSIS package
- Existing Phaser/React/Vite code requires ZERO changes

---

## FINAL INSTRUCTION

The Tauri wrapper is **invisible infrastructure**. Players launch the
game and everything just works — the LLM server starts, the model is
ready, heroes can think. No setup guides, no terminal commands, no
configuration.

Make it seamless. Make it invisible. Make it just work.
