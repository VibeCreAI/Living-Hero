# Living Heros --- Technical Design Document (TDD) (FULL --- Phaser 3 + React + TypeScript + Vite)

## 1. PURPOSE

This document defines the technical architecture for Living Heros
using: - Phaser 3 (game runtime) - React (UI layer) - TypeScript (strict
typing) - Vite (build tool)

It translates product and design into implementable systems that are: -
deterministic - modular - AI-powered (Ollama local LLM for hero brains) - scalable (async PvP
ready)

------------------------------------------------------------------------

## 2. CORE ARCHITECTURE PRINCIPLE

The system is **simulation-first**.

Phaser runs: - rendering - update loop - simulation

React runs: - UI panels - menus - overlays

AI runs: - decision layer only (intent-based)
- Hero brains: **Ollama local LLM** (primary) or heuristic fallback
- Sub-units: code-only deterministic behavior (no LLM)

------------------------------------------------------------------------

## 3. SYSTEM FLOW

Battle Loop:

Game Loop (Phaser Scene update) → Hero Scheduler → Summary Builder →
Hero Decision Provider → Intent Executor → Deterministic Systems →
Render

------------------------------------------------------------------------

## 4. PROJECT STRUCTURE

src/ app/ react/ components/ panels/ hud/ game/ phaser/ Game.ts
config.ts scenes/ BootScene.ts OverworldScene.ts BattleScene.ts
entities/ Hero.ts Unit.ts systems/ MovementSystem.ts CombatSystem.ts
TargetingSystem.ts BattleLoop.ts ai/ HeroDecisionProvider.ts
LocalRuleBasedHeroBrain.ts HeroSummaryBuilder.ts HeroScheduler.ts
IntentExecutor.ts state/ BattleState.ts OverworldState.ts data/
heroes.ts units.ts skills.ts terrain.ts

------------------------------------------------------------------------

## 5. CORE DATA MODELS

### BattleState

``` ts
type BattleState = {
  timeSec: number
  phase: "init" | "active" | "ended"
  alliedUnits: UnitState[]
  enemyUnits: UnitState[]
  heroes: HeroState[]
}
```

### UnitState

``` ts
type UnitState = {
  id: string
  position: {x:number,y:number}
  hp: number
  maxHp: number
  targetId?: string
  state: "idle"|"moving"|"attacking"|"dead"
}
```

### HeroDecision

``` ts
type HeroDecision = {
  intent: string
  targetId?: string
  moveTo?: {x:number,y:number}
  skillId?: string
  recheckInSec: number
}
```

------------------------------------------------------------------------

## 6. PHASER IMPLEMENTATION

### Game.ts

-   initialize Phaser.Game
-   register scenes

### Scenes

Each scene extends Phaser.Scene

#### BootScene

-   load assets

#### OverworldScene

-   player movement
-   encounter trigger

#### BattleScene

-   initialize battle
-   run update loop

------------------------------------------------------------------------

## 7. BATTLE LOOP

Inside BattleScene.update():

``` ts
update(dt){
  commandSystem.update()
  heroScheduler.update()
  movementSystem.update()
  targetingSystem.update()
  combatSystem.update()
  winConditionCheck()
}
```

------------------------------------------------------------------------

## 8. SYSTEM MODULES

### MovementSystem

-   move entities
-   update position

### CombatSystem

-   resolve attacks
-   apply damage

### TargetingSystem

-   assign targets

------------------------------------------------------------------------

## 9. AI ARCHITECTURE

### Two-Tier AI Model

The game uses a **two-tier AI architecture**:

**Tier 1 — Hero Brains (LLM-powered):**
Heroes are intelligent commanders powered by a **local LLM** served via
**Ollama**. Players communicate with heroes via **natural language**
(not just preset commands). Heroes reason about the battlefield, explain
their decisions, and control sub-units.

**Tier 2 — Sub-Units (code-only):**
Units are deterministic, reactive entities. They follow system rules and
hero influence. No LLM involved — pure code execution.

### Ollama Integration

-   Runtime: **Ollama** (local LLM server, bundles llama.cpp)
-   Default model: configurable (recommended: `phi3.5`, `qwen2.5:3b`, or `llama3.2:3b`)
-   API: OpenAI-compatible REST API at `localhost:11434/v1/chat/completions`
-   Latency budget: ~1-3 seconds per decision (50-100 tokens)
-   Fallback: `LocalRuleBasedHeroBrain` if Ollama unavailable

### AI Pipeline

```
Player Message (natural language or preset command)
  ↓
HeroScheduler (triggers on timer, command change, HP threshold)
  ↓
HeroSummaryBuilder (structured battlefield context JSON)
  ↓
HeroDecisionProvider interface
  ├── OllamaHeroBrain (primary — calls local Ollama server)
  │     ├── System prompt: hero personality + traits
  │     ├── Context: HeroSummary JSON
  │     ├── User message: player's natural language command
  │     └── Output: HeroDecision JSON + conversational response
  └── LocalRuleBasedHeroBrain (fallback — heuristic scoring)
  ↓
IntentExecutor (converts decision → unit behavior, deterministic)
```

### Pipeline Components

#### HeroScheduler
-   triggers AI decisions on timer, command change, HP thresholds

#### HeroSummaryBuilder
-   builds structured battlefield context for LLM prompt

#### HeroDecisionProvider
-   interface: `decide(summary) → HeroDecision`
-   implementations: `OllamaHeroBrain`, `LocalRuleBasedHeroBrain`

#### IntentExecutor
-   converts intent → unit actions (deterministic)
-   AI never touches simulation directly

------------------------------------------------------------------------

## 10. REACT INTEGRATION

React mounts Phaser canvas.

React UI reads game state via: - shared store OR - event bridge

React does NOT control game loop.

------------------------------------------------------------------------

## 11. TYPE SAFETY

All major systems must use TypeScript types.

No `any`.

------------------------------------------------------------------------

## 12. PERFORMANCE

-   AI not per-frame
-   simple movement
-   minimal allocations

------------------------------------------------------------------------

## 13. OLLAMA REQUIREMENTS

### Server Setup
-   Ollama runs locally, managed by **Tauri sidecar** in production
-   Bundled Ollama binary launches automatically with the game
-   Model downloaded on first launch (lazy pull with progress UI)
-   Default: `localhost:11434`, OpenAI-compatible `/v1/chat/completions` endpoint
-   Dev mode: developer runs `ollama serve` manually

### Communication Flow
-   Game client (TypeScript) → HTTP POST → Ollama server → JSON response
-   Async: decisions requested via `fetch()`, non-blocking game loop
-   Timeout: 3 seconds max, fallback to heuristic brain on failure

### Determinism for Replay
-   LLM decisions are **recorded** (not re-executed) in replay data
-   Replay injects recorded `HeroDecision` at correct timestamps
-   This ensures replay determinism even though LLM output is non-deterministic

### Desktop Distribution (Tauri)
-   Game is packaged as a Tauri desktop application
-   Phaser + React + Vite frontend runs in Tauri webview (unchanged)
-   Ollama binary bundled as Tauri sidecar (auto-launched on app start)
-   Model management: auto-pull on first launch, cached locally
-   Process lifecycle managed by Tauri Rust backend

------------------------------------------------------------------------

## 14. FUTURE EXTENSIONS

-   Multiple LLM hero personalities (different system prompts)
-   Hero memory (conversation history across battles)
-   async PvP
-   replay system

------------------------------------------------------------------------

## 15. SUCCESS CRITERIA

-   deterministic simulation
-   clear architecture
-   modular systems
-   expandable AI layer

------------------------------------------------------------------------

## 16. FINAL PRINCIPLE

Build systems that are: - predictable - debuggable - replaceable

NOT: - overengineered - tightly coupled
