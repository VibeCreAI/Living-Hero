# Living Heros --- Coding Agent Initiation Prompt (FULL --- Phaser 3 + React + TypeScript + Vite)

## IMPORTANT: DOCUMENT HIERARCHY

You are working with multiple project documents.

Use them in the following priority order:

1.  **TDD (Technical Design Document)** → source of truth for
    architecture and systems
2.  **PRD (Product Requirements Document)** → defines product scope and
    direction
3.  **GDD (Game Design Document)** → defines gameplay experience and
    design intent
4.  **This prompt** → defines the current task and constraints

If there is any conflict: - Follow TDD first - Then PRD - Then GDD -
Then this prompt

------------------------------------------------------------------------

## YOUR ROLE

You are modifying an existing project.

You are building a **Phaser 3 + React + TypeScript + Vite** application.

DO NOT: - replace the stack - introduce a different framework - rewrite
the project from scratch

DO: - extend the project cleanly - follow modular architecture - follow
TDD strictly

------------------------------------------------------------------------

## PROJECT STACK

-   **Game Engine:** Phaser 3
-   **UI Framework:** React
-   **Language:** TypeScript
-   **Build Tool:** Vite

------------------------------------------------------------------------

## PROJECT ARCHITECTURE OVERVIEW

You MUST follow this separation:

React (UI / App Layer) → Phaser Game Container → Game Systems (TS
Modules) → AI Layer (Hero Decision System)

------------------------------------------------------------------------

## CORE DESIGN PRINCIPLE

The game is NOT UI-driven.

The game is: - simulation-driven - deterministic - AI-assisted
(intent-based)

------------------------------------------------------------------------

## CURRENT TASK

Implement **Prototype 0 (Vertical Slice Foundation)**

This includes: - overworld scene - battle scene - hero + unit system -
command system - placeholder AI system - UI shell

------------------------------------------------------------------------

## REQUIRED READING BEFORE CODING

Before writing code, you MUST:

1.  Read TDD:
    -   battle loop
    -   hero scheduler
    -   summary builder
    -   intent executor
2.  Read PRD:
    -   scope boundaries
3.  Read GDD:
    -   player experience

------------------------------------------------------------------------

## PROJECT STRUCTURE

Use this structure:

src/ app/ react/ components/ panels/ hud/ routes/

game/ phaser/ Game.ts config.ts

      scenes/
        BootScene.ts
        OverworldScene.ts
        BattleScene.ts

      entities/
        Hero.ts
        Unit.ts

      systems/
        MovementSystem.ts
        CombatSystem.ts
        TargetingSystem.ts
        BattleLoop.ts

      ai/
        HeroDecisionProvider.ts
        LocalRuleBasedHeroBrain.ts
        HeroSummaryBuilder.ts
        HeroScheduler.ts
        IntentExecutor.ts

      state/
        BattleState.ts
        OverworldState.ts

      data/
        heroes.ts
        units.ts
        skills.ts
        terrain.ts

main.tsx App.tsx

------------------------------------------------------------------------

## PHASER INTEGRATION RULE

React MUST NOT control game loop.

Phaser handles: - rendering - simulation - update loop

React handles: - UI panels - menus - overlays

------------------------------------------------------------------------

## SCENE REQUIREMENTS

### BootScene

-   initialize game
-   load assets

### OverworldScene

-   simple map
-   hero movement
-   encounter trigger

### BattleScene

-   spawn units
-   run battle loop
-   integrate AI system

------------------------------------------------------------------------

## HERO AI RULE (CRITICAL)

-   AI outputs intent only
-   AI runs on scheduler
-   AI uses structured summary
-   AI NEVER controls simulation directly

------------------------------------------------------------------------

## COMMAND SYSTEM

Implement:

type PlayerCommand = { type: "protect" \| "hold" \| "advance" \|
"focus", targetId?: string }

------------------------------------------------------------------------

## UI REQUIREMENTS

React UI must include:

### Overworld UI

-   hero info
-   scene label

### Battle UI

-   selected unit panel
-   command buttons
-   hero intent display

------------------------------------------------------------------------

## TYPE DEFINITIONS (MANDATORY)

Create strict TypeScript types:

type HeroSummary = {} type HeroDecision = {} type BattleState = {} type
UnitState = {} type PlayerCommand = {}

All systems MUST use typed interfaces.

------------------------------------------------------------------------

## ASSET RULES

Assets must be loaded via Phaser loader.

Structure:

assets/ terrain/ units/ heroes/ enemies/ ui/

------------------------------------------------------------------------

## IMPLEMENTATION PRIORITY

1.  Phaser setup + React integration
2.  Scene system
3.  Unit system
4.  Battle loop
5.  Command system
6.  AI interfaces
7.  Scheduler
8.  UI shell

------------------------------------------------------------------------

## CODE QUALITY RULES

-   small modules
-   no monolithic files
-   no hidden state
-   readable logic
-   no premature optimization

------------------------------------------------------------------------

## WHAT NOT TO BUILD

-   gacha
-   PvP
-   backend
-   BitNet integration
-   complex pathfinding
-   full UI system

------------------------------------------------------------------------

## OUTPUT EXPECTATION

You must produce:

-   working Phaser game
-   working React UI shell
-   overworld → battle transition
-   hero + unit system
-   AI placeholder system
-   clean architecture

------------------------------------------------------------------------

## FINAL INSTRUCTION

Build the smallest system that is:

-   architecturally correct
-   fully functional
-   easy to expand

Do NOT overbuild.

Focus on: - clarity - structure - correctness
