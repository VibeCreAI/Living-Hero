# Living Heros --- Technical Design Document (TDD) (FULL --- Phaser 3 + React + TypeScript + Vite)

## 1. PURPOSE

This document defines the technical architecture for Living Heros
using: - Phaser 3 (game runtime) - React (UI layer) - TypeScript (strict
typing) - Vite (build tool)

It translates product and design into implementable systems that are: -
deterministic - modular - AI-powered (BitNet local LLM for hero brains) - scalable (async PvP
ready)

------------------------------------------------------------------------

## 2. CORE ARCHITECTURE PRINCIPLE

The system is **simulation-first**.

Phaser runs: - rendering - update loop - simulation

React runs: - UI panels - menus - overlays

AI runs: - decision layer only (intent-based)
- Hero brains: **BitNet local LLM** (primary) or heuristic fallback
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
Heroes are intelligent commanders powered by **BitNet b1.58-2B-4T**, a
1.58-bit local LLM from Microsoft. Players communicate with heroes via
**natural language** (not just preset commands). Heroes reason about the
battlefield, explain their decisions, and control sub-units.

**Tier 2 — Sub-Units (code-only):**
Units are deterministic, reactive entities. They follow system rules and
hero influence. No LLM involved — pure code execution.

### BitNet Integration

-   Model: `microsoft/bitnet-b1.58-2B-4T` (2B params, 0.4GB memory, ~29ms/token on CPU)
-   Runtime: `bitnet.cpp` inference server (`llama-server` compatible)
-   API: OpenAI-compatible REST API at `localhost:8080`
-   Latency budget: ~1-2 seconds per decision (50-70 tokens)
-   Fallback: `LocalRuleBasedHeroBrain` if server unavailable

### AI Pipeline

```
Player Message (natural language or preset command)
  ↓
HeroScheduler (triggers on timer, command change, HP threshold)
  ↓
HeroSummaryBuilder (structured battlefield context JSON)
  ↓
HeroDecisionProvider interface
  ├── BitNetHeroBrain (primary — calls local LLM server)
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
-   implementations: `BitNetHeroBrain`, `LocalRuleBasedHeroBrain`

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

## 13. BITNET REQUIREMENTS

### Server Setup
-   BitNet inference server runs locally as a background process
-   Uses `llama-server` (llama.cpp) with BitNet b1.58-2B-4T GGUF model
-   Default: `localhost:8080`, OpenAI-compatible `/v1/chat/completions` endpoint

### Communication Flow
-   Game client (TypeScript) → HTTP POST → BitNet server → JSON response
-   Async: decisions requested via `fetch()`, non-blocking game loop
-   Timeout: 3 seconds max, fallback to heuristic brain on failure

### Determinism for Replay
-   BitNet decisions are **recorded** (not re-executed) in replay data
-   Replay injects recorded `HeroDecision` at correct timestamps
-   This ensures replay determinism even though LLM output is non-deterministic

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
