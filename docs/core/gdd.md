# Living Heros --- Game Design Document (GDD) (FULL --- Phaser 3 + React + TypeScript + Vite)

## 1. GAME OVERVIEW

**Living Heros** is a 2D strategy game that combines:

-   Overworld exploration (Heroes of Might and Magic--inspired)
-   Real-time tactical battles (RTS-inspired)
-   AI-driven hero commanders (core innovation)

The defining feature:

> Players do NOT directly control units.\
> Players issue high-level commands, and heroes interpret and execute
> them.

------------------------------------------------------------------------

## 2. PLAYER FANTASY

The player is:

-   A supreme commander
-   Leading intelligent, semi-autonomous heroes
-   Influencing outcomes through strategy, not execution

The player is NOT:

-   A micromanaging RTS player
-   A fast-click mechanical player
-   A unit-level controller

------------------------------------------------------------------------

## 3. CORE DESIGN PILLARS

### 3.1 Intelligent Heroes

-   Heroes think, interpret, and decide
-   Each hero behaves differently based on personality
-   Decisions feel intentional and explainable

------------------------------------------------------------------------

### 3.2 Command Over Control

-   Player gives intent, not instructions
-   Commands are interpreted, not executed literally
-   Trust and adaptation are core gameplay

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

Heroes are: - Commanders - Decision-makers - Behavioral entities

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

### 7.2 Command Philosophy

Commands are: - vague enough for interpretation - meaningful enough to
guide outcome

------------------------------------------------------------------------

### 7.3 Example

Player: "Protect archers"

Hero: - moves to defensive position - intercepts enemies - uses
defensive skills

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

-   current hero intent
-   recent decision
-   command influence

Examples:

-   "Protecting Archers"
-   "Advancing (High Confidence)"
-   "Retreating (Low HP)"

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

> commanding intelligent heroes who interpret, decide, and fight with
> you.
