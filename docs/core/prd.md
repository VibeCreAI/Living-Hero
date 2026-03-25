# Living Heros --- Product Requirements Document (PRD) (FULL --- Phaser 3 + React + TypeScript)

## 1. PRODUCT OVERVIEW

Living Heros is a 2D strategy game that combines: - Overworld
exploration (Heroes of Might and Magic inspired) - Real-time tactical
battles (RTS-inspired) - AI-driven hero commanders (core innovation)

The defining feature: Players do not directly control units.\
Players issue high-level commands, and heroes interpret and execute
them.

------------------------------------------------------------------------

## 2. PRODUCT VISION

Living Heros aims to redefine strategy gameplay by shifting control from
micromanagement to intelligent delegation.

Core idea: "Players command minds, not units."

The game should feel like: - commanding generals, not soldiers -
influencing decisions, not clicking actions - observing intelligent
behavior, not scripting it

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

Heroes are **AI-driven commanders**

### Responsibilities

-   Interpret player commands
-   Make tactical decisions
-   Influence units

### Hero Attributes

-   Intelligence → decision quality
-   Discipline → command adherence
-   Boldness → aggression
-   Caution → risk management
-   Empathy → ally prioritization
-   Decisiveness → commitment vs switching

------------------------------------------------------------------------

## 5.4 Command System

### MVP Commands

-   Protect
-   Hold
-   Advance
-   Focus Target

### Design Philosophy

Commands are: - high-level - interpretable - not deterministic
instructions

------------------------------------------------------------------------

## 5.5 AI System

### Input

-   Structured battlefield summary (JSON)

### Output

-   Tactical intent

### Constraints

-   No direct control
-   No per-frame thinking
-   Scheduled decisions only

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
-   BitNet integration

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
