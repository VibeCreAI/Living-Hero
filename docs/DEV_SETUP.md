# Living Heros — Dev Setup Guide

## Prerequisites

- Node.js 18+ or [Bun](https://bun.sh)
- Rust toolchain (for Tauri desktop mode)
- [Ollama](https://ollama.com/download) (for AI hero brains — **dev only**, bundled automatically in production)

> This guide uses `bun` as the default package manager. All commands work with `npm` as well — just swap `bun` for `npm`.

---

## 1. Install Dependencies

```bash
bun install
```

---

## 2. Web Dev Mode (Vite Only)

Run the Phaser + React frontend in the browser — no desktop wrapper, no Ollama.

```bash
bun run dev
```

Opens at **http://localhost:8080**

Use this mode for:
- UI and gameplay iteration
- Fast hot-reload development
- Testing without Rust/Tauri compilation
- Game works without Ollama (falls back to heuristic AI)

---

## 3. Desktop Dev Mode (Tauri + Vite)

Run as a native desktop app with Tauri wrapping the Vite dev server.

### First-time setup

```bash
bun run setup-sidecar
```

This creates a placeholder sidecar binary so Tauri can compile. In production, the real Ollama binary is bundled instead.

### Run

```bash
bun run tauri:dev
```

This will:
1. Start the Vite dev server on `localhost:5173`
2. Launch the Tauri desktop window pointing to it
3. Hot-reload works for frontend changes
4. Rust backend recompiles on changes to `src-tauri/`

### Build for production

```bash
bun run tauri:build
```

Produces a distributable desktop app in `src-tauri/target/release/bundle/`.

---

## 4. Ollama (AI Hero Brains)

### How it works in production (players)

Players **never install Ollama manually**. The production flow is:

1. Player installs game (from Steam, etc.)
2. Tauri sidecar bundles the Ollama binary inside the app
3. On first launch, the model auto-downloads (~2GB) with a progress UI
4. Ollama runs invisibly in the background — zero player setup

This is handled by `src-tauri/src/ollama.rs` (sidecar management) and `ModelDownloadOverlay.tsx` (download progress UI).

### How it works in development (you)

In dev mode, you run Ollama manually:

#### Install Ollama

Download from: https://ollama.com/download

After installing, restart your terminal so the `ollama` command is available.

#### Pull the default model

```bash
ollama pull alibayram/smollm3
```

#### Start the server

```bash
ollama serve
```

Ollama API runs at `http://localhost:11434`. You can verify by visiting that URL in your browser — it should say "Ollama is running".

> On Windows, Ollama may auto-start as a background service after install. Check `http://localhost:11434` before running `ollama serve`.

#### Without Ollama

The game works fine without Ollama running — the AI automatically falls back to the heuristic rule-based brain (`ScoredPersonalityBrain`). The battle HUD shows:
- Green dot: "AI Online" — Ollama connected, LLM-powered hero
- Red dot: "AI Offline (Fallback)" — using heuristic brain

### Recommended models

- `alibayram/smollm3` — best structured JSON output, strong reasoning (default)
- `llama3.2:3b` — solid all-rounder, good conversation
- `phi3.5` — good for coding/structured tasks
- `gemma2:2b` — fastest, for low-end hardware

### Integration status

- [x] OllamaHeroBrain implementation (structured outputs)
- [x] Chat UI for player-hero conversation
- [x] LLM connection status indicator
- [x] Fallback to heuristic brain when Ollama unavailable
- [ ] Model auto-download on first launch (Tauri sidecar)

---

## Troubleshooting

### Vite dev server won't start
- Check port 8080 isn't in use: `bunx kill-port 8080`

### Tauri compilation fails
- Ensure Rust is installed: `rustup --version`
- Run `bun run setup-sidecar` to create placeholder sidecar
- On Windows, ensure WebView2 is installed (comes with Windows 11)

### Ollama not responding
- Check Ollama is running: visit `http://localhost:11434` in browser
- Restart: `ollama serve`
- Game still works without it (fallback AI)
