# Living Heros --- Product Requirements Document (PRD) (FULL --- Phaser 3 + React + TypeScript)

## 1. PRODUCT OVERVIEW

Living Heros is a 2D strategy game that combines: - Overworld
exploration (Heroes of Might and Magic inspired) - Real-time tactical
battles (RTS-inspired) - AI-driven hero commanders (core innovation)

The defining feature: Players do not directly control units.\
Players **talk to** AI-powered hero commanders (running on **Ollama local LLM**),
who interpret, reason, and execute strategies. Heroes control sub-units
through code-based deterministic systems.

The core innovation: Heroes are **living AI agents** powered by a local
language model. Players strategize *with* them using natural language,
not just preset buttons.

------------------------------------------------------------------------

## 2. PRODUCT VISION

Living Heros aims to redefine strategy gameplay by shifting control from
micromanagement to intelligent delegation.

Core idea: "Players command minds, not units."

The game should feel like: - **talking to** intelligent commanders, not clicking buttons -
strategizing *with* heroes, not issuing orders *at* them -
observing emergent intelligent behavior, not scripting it -
building trust (or frustration) with AI personalities that reason and explain

------------------------------------------------------------------------

## 3. TARGET EXPERIENCE

Players should experience:

-   Strategic control without mechanical overload
-   Trust (and sometimes frustration) in AI-driven heroes
-   Clear cause-effect between commands and outcomes
-   Emergent gameplay from hero personalities

------------------------------------------------------------------------

## 4. CORE GAMEPLAY LOOP

### 4.1 Early Game Loop (Prototype 0)

1.  Player moves hero on overworld
2.  Player encounters enemy node
3.  Transition into battle
4.  Player issues high-level commands
5.  Hero interprets commands
6.  Units act based on hero decisions
7.  Battle resolves (win/lose)
8.  Return to overworld

------------------------------------------------------------------------

### 4.2 Mid Game Loop

1.  Expand territory
2.  Acquire new heroes (gacha)
3.  Build army compositions
4.  Optimize hero-command synergy
5.  Engage in asynchronous PvP
6.  Improve defense strategy

------------------------------------------------------------------------

### 4.3 Late Game Loop

1.  Multi-hero coordination
2.  Complex battlefield interactions
3.  PvP optimization and replay analysis
4.  Meta progression and specialization

------------------------------------------------------------------------

## 5. CORE SYSTEMS

## 5.1 Overworld System

### Purpose

-   Provide strategic layer
-   Gate battles
-   Control pacing

### Features

-   Map navigation
-   Encounter nodes
-   Castle nodes
-   Resource nodes (future)
-   Fog of war (future)

### Player Actions

-   Move hero
-   Select target
-   Initiate battle

------------------------------------------------------------------------

## 5.2 Battle System

### Type

-   Real-time tactical combat

### Key Features

-   Deterministic simulation
-   Terrain influence (chokepoints, positioning)
-   Hero-driven command interpretation

### Core Philosophy

The player does NOT micromanage units.

------------------------------------------------------------------------

## 5.3 Hero System

### Core Role

Heroes are **LLM-powered commanders** running on Ollama (local inference).
They are the player's strategic partners — not tools, but collaborators
with distinct personalities.

### Two-Tier Architecture

-   **Hero (LLM brain):** Receives natural language from player + battlefield
    context. Reasons, explains, and outputs tactical decisions.
-   **Sub-units (code-only):** Deterministic entities that follow hero
    decisions. No LLM involved — pure system rules.

### Player-Hero Interaction

-   Players communicate via **natural language chat** (primary) or preset
    commands (quick access)
-   Heroes **respond conversationally** explaining their reasoning
-   Example: Player says "The archers are getting destroyed, do something!"
    → Hero responds "Moving warriors to screen the archers. I'll hold the
    flank." → Units reposition accordingly

### Hero Attributes

-   Intelligence → decision quality, context awareness
-   Discipline → command adherence vs independent judgment
-   Boldness → aggression, willingness to take risks
-   Caution → risk management, retreat tendency
-   Empathy → ally prioritization, protective instincts
-   Decisiveness → commitment duration, less flip-flopping

### LLM Technology

-   Runtime: **Ollama** (local LLM server, wraps llama.cpp)
-   Default model: configurable (recommended: `phi3.5`, `qwen2.5:3b`, or `llama3.2:3b`)
-   Runs locally on CPU (GPU optional) — no cloud dependency, no API costs
-   Bundled with game via **Tauri sidecar** — zero extra setup for players
-   Model auto-downloaded on first launch (~2-3GB, cached locally)
-   Fallback: heuristic rule-based brain when LLM unavailable

------------------------------------------------------------------------

## 5.4 Command System

### Primary: Natural Language Chat

Players type natural language messages to heroes during battle:
-   "Focus the archers, they're shredding our front line"
-   "Fall back and regroup, we're losing too many warriors"
-   "Can you flank from the right while I send the archers forward?"

Heroes respond conversationally and adjust their tactics.

### Quick Commands (Preset Shortcuts)

For fast access during combat:
-   Protect
-   Hold
-   Advance
-   Focus Target

### Design Philosophy

Commands are: - natural language preferred (richer intent) -
preset buttons for speed - interpreted by LLM hero, not executed literally -
hero explains reasoning back to player

------------------------------------------------------------------------

## 5.5 AI System

### Architecture

Two-tier system:

**Hero AI (Ollama LLM):**
-   Input: structured battlefield summary (JSON) + player's natural language message
-   Processing: local LLM inference via Ollama server
-   Output: tactical intent (structured `HeroDecision`) + conversational response

**Sub-Unit AI (Code-only):**
-   Input: hero's decision + system rules
-   Processing: deterministic code execution
-   Output: movement, targeting, combat actions

### Constraints

-   LLM outputs **intent only** — never controls simulation directly
-   LLM runs on **scheduler** (every 2-3 seconds, not per-frame)
-   Sub-units are **fully deterministic** — no randomness, no LLM
-   Fallback to heuristic brain if LLM server unavailable

------------------------------------------------------------------------

## 5.6 Unit System

Units are: - deterministic - reactive - simple

Units: - do not have independent intelligence - follow system rules and
hero influence

------------------------------------------------------------------------

## 5.7 Terrain System

Terrain affects: - movement - positioning - tactical decisions

Examples: - bridges (chokepoints) - open fields - blocked paths

------------------------------------------------------------------------

## 6. UI/UX DESIGN

## 6.1 Overworld UI

-   Hero status
-   Location indicator
-   Interaction prompts

## 6.2 Battle UI

-   Selected unit panel
-   Command panel
-   Hero intent display
-   Battle status (win/lose)

## 6.3 Design Principles

-   Minimal
-   Clear
-   Expandable
-   Informative (not overwhelming)

------------------------------------------------------------------------

## 7. PLAYER EXPERIENCE GOALS

Players should:

-   understand why heroes act the way they do
-   feel agency without micromanagement
-   adapt strategy instead of clicking faster

------------------------------------------------------------------------

## 8. PROGRESSION SYSTEM (FUTURE)

### Hero Progression

-   leveling
-   skill unlocks
-   trait variation

### Army Progression

-   unit upgrades
-   composition strategies

### Castle Progression

-   defensive setup
-   resource management

------------------------------------------------------------------------

## 9. GACHA SYSTEM (FUTURE)

### Purpose

-   hero acquisition
-   monetization

### Design

-   rarity tiers
-   personality diversity
-   skill diversity

------------------------------------------------------------------------

## 10. ASYNCHRONOUS PVP (FUTURE)

### Core Idea

-   attack other player castles
-   defender uses AI-driven setup

### Flow

-   defender sets strategy
-   attacker plays battle
-   replay generated

------------------------------------------------------------------------

## 11. TECH STACK

-   Phaser 3 (game engine)
-   React (UI)
-   TypeScript (code)
-   Vite (build tool)
-   Ollama (hero AI — local LLM server, OpenAI-compatible API)
-   Tauri (desktop app wrapper — bundles Ollama as sidecar)

------------------------------------------------------------------------

## 12. MVP SCOPE (PROTOTYPE 0)

### MUST INCLUDE

-   overworld scene
-   battle scene
-   hero system
-   unit system
-   command system
-   basic UI
-   placeholder AI

### MUST NOT INCLUDE

-   gacha
-   PvP
-   backend
-   monetization
-   Ollama LLM integration (implemented — see prompt 03b)

------------------------------------------------------------------------

## 13. RISKS

### Technical Risks

-   AI system complexity
-   state management bugs
-   performance scaling

### Design Risks

-   AI unpredictability
-   player confusion
-   lack of control feeling

------------------------------------------------------------------------

## 14. SUCCESS CRITERIA

Prototype is successful if:

-   players understand command → outcome relationship
-   hero behavior feels consistent
-   battle loop is enjoyable
-   architecture is stable and extendable

------------------------------------------------------------------------

## 15. PRODUCT PRINCIPLE

Living Heros is not about: - speed - precision clicking - micro control

It is about: - decision making - trust - intelligent systems
