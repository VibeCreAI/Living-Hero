# Living Heros --- Technical Design Document (TDD) (FULL --- Phaser 3 + React + TypeScript + Vite)

## 1. PURPOSE

This document defines the technical architecture for Living Heros
using: - Phaser 3 (game runtime) - React (UI layer) - TypeScript (strict
typing) - Vite (build tool)

It translates product and design into implementable systems that are: -
deterministic - modular - AI-ready (BitNet later) - scalable (async PvP
ready)

------------------------------------------------------------------------

## 2. CORE ARCHITECTURE PRINCIPLE

The system is **simulation-first**.

Phaser runs: - rendering - update loop - simulation

React runs: - UI panels - menus - overlays

AI runs: - decision layer only (intent-based)

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

### HeroScheduler

-   triggers AI decisions

### HeroSummaryBuilder

-   builds local context

### HeroDecisionProvider

-   returns structured decision

### IntentExecutor

-   converts intent → actions

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

## 13. FUTURE EXTENSIONS

-   BitNet AI integration
-   async PvP
-   replay system

------------------------------------------------------------------------

## 14. SUCCESS CRITERIA

-   deterministic simulation
-   clear architecture
-   modular systems
-   expandable AI layer

------------------------------------------------------------------------

## 15. FINAL PRINCIPLE

Build systems that are: - predictable - debuggable - replaceable

NOT: - overengineered - tightly coupled
