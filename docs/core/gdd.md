# Living Heros --- Game Design Document (GDD) (FULL --- Phaser 3 + React + TypeScript + Vite)

## 1. GAME OVERVIEW

**Living Heros** is a 2D strategy game that combines:

-   Overworld exploration (Heroes of Might and Magic--inspired)
-   Real-time tactical battles (RTS-inspired)
-   AI-driven hero commanders (core innovation)

The defining feature:

> Players do NOT directly control units.\
> Players **talk to** LLM-powered hero commanders who reason, decide,
> and fight alongside them. Heroes run on **Ollama** (local LLM) and
> control sub-units through deterministic code systems.

------------------------------------------------------------------------

## 2. PLAYER FANTASY

The player is:

-   A supreme commander who **talks to** AI heroes
-   Strategizing *with* intelligent, semi-autonomous commanders
-   Influencing outcomes through conversation and trust, not execution
-   Building relationships with heroes who have distinct personalities

The player is NOT:

-   A micromanaging RTS player
-   A fast-click mechanical player
-   A unit-level controller
-   Issuing commands into a void — heroes **respond and explain**

------------------------------------------------------------------------

## 3. CORE DESIGN PILLARS

### 3.1 Intelligent Heroes (LLM-Powered)

-   Heroes are **living AI agents** running on Ollama (local LLM)
-   Each hero has a distinct personality expressed through LLM system prompts
-   Players **converse** with heroes — heroes reason and explain decisions
-   Heroes think, interpret, and decide — then tell the player why
-   Sub-units follow hero decisions through code (no LLM)

------------------------------------------------------------------------

### 3.2 Conversation Over Commands

-   Player **talks to** heroes using natural language
-   Heroes interpret, reason, and respond conversationally
-   Quick-access preset commands available for speed (Advance, Hold, Protect, Focus)
-   Trust and adaptation are core gameplay — heroes have opinions

------------------------------------------------------------------------

### 3.3 Hybrid Gameplay

-   Overworld: strategic navigation
-   Battle: real-time execution
-   AI bridges both layers

------------------------------------------------------------------------

### 3.4 Readable AI Behavior

-   Players must understand WHY heroes act
-   Decisions must feel consistent
-   Feedback must be visible (intent, rationale)

------------------------------------------------------------------------

## 4. GAMEPLAY STRUCTURE

### 4.1 Overworld Layer

Purpose: - Strategic planning - Resource positioning - Encounter
selection

Features: - Map navigation - Hero movement - Encounter nodes - Castle
nodes (future)

------------------------------------------------------------------------

### 4.2 Battle Layer

Purpose: - Tactical resolution - AI interpretation showcase

Features: - Real-time combat - Small-scale engagements -
Terrain-influenced positioning

------------------------------------------------------------------------

## 5. CORE GAME LOOP

### Prototype 0 Loop

1.  Move hero on overworld
2.  Select encounter
3.  Enter battle
4.  Issue command
5.  Watch hero interpret
6.  Battle resolves
7.  Return to overworld

------------------------------------------------------------------------

## 6. HERO DESIGN

### 6.1 Role

Heroes are: - **LLM-powered commanders** (Ollama local inference) -
Conversational partners the player strategizes with -
Decision-makers who explain their reasoning - Controllers of code-based
sub-units

------------------------------------------------------------------------

### 6.2 Traits

Each hero has:

-   Intelligence
-   Discipline
-   Boldness
-   Caution
-   Empathy
-   Decisiveness

------------------------------------------------------------------------

### 6.3 Behavior Examples

-   High boldness → aggressive push
-   High caution → defensive retreat
-   High discipline → follows player command closely
-   Low discipline → improvises

------------------------------------------------------------------------

## 7. COMMAND SYSTEM

### 7.1 MVP Commands

-   Protect
-   Hold
-   Advance
-   Focus Target

------------------------------------------------------------------------

### 7.2 Natural Language (Primary)

Players type messages to heroes during battle:
-   "The archers are getting overwhelmed, help them!"
-   "I think we should flank from the right, what do you think?"
-   "Pull back everyone, we need to regroup"

Heroes respond conversationally:
-   "On it. Sending warriors to screen the archers."
-   "Risky, but I like it. Moving to flank position now."
-   "Agreed. Pulling back to our starting position."

### 7.3 Command Philosophy

Natural language is the primary interface. Preset buttons are shortcuts.
Heroes interpret intent — same message may produce different behavior
from different hero personalities.

------------------------------------------------------------------------

### 7.4 Example Flow

Player types: "Protect the archers, they're getting destroyed"

Hero (bold personality) responds: "I'll push forward and intercept those
warriors before they reach the archers. Aggressive defense!"
→ Moves units to engage enemies approaching archers

Hero (cautious personality) responds: "Pulling warriors back to form a
defensive line around the archers. We'll hold here."
→ Repositions units defensively around archers

------------------------------------------------------------------------

## 8. UNIT DESIGN

Units are:

-   simple
-   deterministic
-   reactive

They: - follow system rules - are influenced by heroes - do not think
independently

------------------------------------------------------------------------

## 9. BATTLE DESIGN

### 9.1 Goals

-   readable chaos
-   tactical clarity
-   meaningful positioning

------------------------------------------------------------------------

### 9.2 Elements

-   melee units
-   ranged units
-   hero presence
-   terrain constraints

------------------------------------------------------------------------

### 9.3 Victory Condition

-   eliminate all enemies

------------------------------------------------------------------------

## 10. TERRAIN DESIGN

Terrain affects:

-   movement paths
-   positioning advantage
-   AI decision-making

Examples:

-   bridges → chokepoints
-   open fields → free movement
-   blocked paths → routing decisions

------------------------------------------------------------------------

## 11. UI/UX DESIGN

### 11.1 Overworld UI

-   hero info
-   navigation hints
-   encounter indicators

------------------------------------------------------------------------

### 11.2 Battle UI

-   selected unit panel
-   command buttons
-   hero intent display
-   battle status

------------------------------------------------------------------------

### 11.3 UX Goals

-   clarity over complexity
-   immediate readability
-   low cognitive load

------------------------------------------------------------------------

## 12. PLAYER FEEDBACK SYSTEM

Players must see:

-   **Chat log** with hero (natural language conversation)
-   Current hero intent (visual indicator on battlefield)
-   Hero's reasoning (conversational explanation)

Examples of hero chat responses:

-   "Protecting archers — those warriors are too close for comfort."
-   "Advancing with confidence. We outnumber them on this flank."
-   "Pulling back. Too many losses, need to regroup."
-   "I disagree with holding here, but you're the boss. Holding position."

------------------------------------------------------------------------

## 13. PROGRESSION SYSTEM (FUTURE)

### 13.1 Hero Progression

-   leveling
-   skill unlocks
-   trait variation

------------------------------------------------------------------------

### 13.2 Army Progression

-   unit upgrades
-   formation strategies

------------------------------------------------------------------------

### 13.3 Castle System

-   defense planning
-   territory control

------------------------------------------------------------------------

## 14. GACHA SYSTEM (FUTURE)

### Purpose

-   hero acquisition
-   monetization driver

### Design Goals

-   diversity of personality
-   meaningful differences
-   collectible value

------------------------------------------------------------------------

## 15. ASYNC PVP (FUTURE)

### Core Idea

-   attack other player castles
-   defender uses AI setup

### Player Experience

-   attacker plays live
-   defender watches replay

------------------------------------------------------------------------

## 16. GAME FEEL

The game should feel:

-   strategic
-   responsive
-   readable
-   slightly unpredictable but fair

------------------------------------------------------------------------

## 17. RISKS

### Design Risks

-   AI feels random
-   lack of player control
-   unclear decision reasoning

------------------------------------------------------------------------

### Mitigation

-   visible intent
-   consistent behavior patterns
-   clear feedback

------------------------------------------------------------------------

## 18. SUCCESS CRITERIA

Game succeeds if:

-   players understand AI behavior
-   commands influence outcomes
-   battles feel engaging
-   heroes feel unique

------------------------------------------------------------------------

## 19. ART DIRECTION

-   Pixel art (Tiny Swords baseline)
-   Clear silhouettes
-   Strong readability

------------------------------------------------------------------------

## 20. FINAL DESIGN PRINCIPLE

Living Heros is NOT about controlling units.

It is about:

> talking to intelligent heroes who think, reason, explain, and fight
> alongside you. Heroes are living AI agents — not tools to command,
> but partners to strategize with.
