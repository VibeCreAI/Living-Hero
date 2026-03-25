# Living Heros --- Prompt #5: Overworld + Progression System (FULL --- Phaser 3 + TypeScript)

## CONTEXT

You are extending Living Heros after Prompt #4.

Current system includes: - Battle system (deterministic) - Hero AI
(personality-driven) - Player command UX + feedback layer - React +
Phaser integration

Now you must build the **Overworld + Core Progression Layer**

This transforms the prototype into a **playable game loop**.

------------------------------------------------------------------------

## DOCUMENT PRIORITY

1.  TDD → architecture
2.  PRD → scope
3.  GDD → gameplay feel
4.  This prompt → execution

------------------------------------------------------------------------

## GOAL

Create a system where:

-   Player navigates a world map
-   Encounters battles
-   Returns to overworld after battle
-   Progression loop is established

------------------------------------------------------------------------

## CORE LOOP

``` text
Overworld → Encounter → Battle → Result → Return → Repeat
```

------------------------------------------------------------------------

# SYSTEM OVERVIEW

``` text
OverworldScene
  ↓
Encounter Trigger
  ↓
BattleScene
  ↓
Battle Result
  ↓
Overworld Update
```

------------------------------------------------------------------------

## STEP 1 --- OVERWORLD SCENE (PHASER)

File: `OverworldScene.ts`

### Responsibilities:

-   render map
-   control hero movement
-   detect encounters

### Requirements:

-   tile-based or simple coordinate map
-   camera follow hero
-   basic movement (arrow keys / click)

------------------------------------------------------------------------

## STEP 2 --- HERO OVERWORLD ENTITY

Create:

``` ts
type OverworldHero = {
  id: string
  position: {x:number,y:number}
}
```

------------------------------------------------------------------------

## STEP 3 --- ENCOUNTER SYSTEM

Create encounter nodes:

``` ts
type EncounterNode = {
  id: string
  position: {x:number,y:number}
  type: "battle"
  enemyGroupId: string
  completed: boolean
}
```

### Behavior:

-   when hero overlaps node → trigger battle

------------------------------------------------------------------------

## STEP 4 --- SCENE TRANSITION

When encounter triggered:

``` ts
this.scene.start("BattleScene", {
  encounterId
})
```

BattleScene must: - receive encounter data - spawn enemies accordingly

------------------------------------------------------------------------

## STEP 5 --- RETURN FLOW

After battle ends:

``` ts
this.scene.start("OverworldScene", {
  result: "win" | "lose",
  encounterId
})
```

------------------------------------------------------------------------

## STEP 6 --- OVERWORLD STATE

Create:

``` ts
type OverworldState = {
  heroPosition: Vec2
  encounters: EncounterNode[]
}
```

Store globally.

------------------------------------------------------------------------

## STEP 7 --- ENCOUNTER RESOLUTION

If win: - mark encounter completed - remove or disable node

If lose: - allow retry or fallback behavior

------------------------------------------------------------------------

## STEP 8 --- BASIC PROGRESSION

For Prototype 0:

-   no leveling system yet
-   no economy
-   no inventory

Only: - progression through encounters

------------------------------------------------------------------------

## STEP 9 --- UI (REACT)

Overworld UI:

-   current objective
-   hero status
-   encounter indicators

------------------------------------------------------------------------

## STEP 10 --- MINIMAP (OPTIONAL SIMPLE)

-   small overlay showing nodes
-   optional for clarity

------------------------------------------------------------------------

## STEP 11 --- DATA STRUCTURE

Create:

``` ts
encounters.ts
```

Define enemy groups:

``` ts
type EnemyGroup = {
  id: string
  units: string[]
}
```

------------------------------------------------------------------------

## STEP 12 --- INTEGRATION

-   OverworldScene controls navigation
-   BattleScene handles combat
-   Shared state connects them

------------------------------------------------------------------------

## STEP 13 --- DEBUG

Display: - hero position - encounter IDs - current state

------------------------------------------------------------------------

## WHAT NOT TO DO

-   no gacha
-   no PvP
-   no backend
-   no inventory system
-   no complex map generation

------------------------------------------------------------------------

## SUCCESS CRITERIA

-   player can move on map
-   encounters trigger battles
-   battle returns to overworld
-   progression loop works

------------------------------------------------------------------------

## FINAL INSTRUCTION

Build a **simple but complete gameplay loop**.

This is the moment the project becomes:

👉 a real game, not just systems
