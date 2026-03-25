# Living Heros --- Prompt #7: Enemy AI Variation & Archetypes (FULL --- Phaser 3 + TypeScript)

## CONTEXT

You are extending Living Heros after Prompt #6.

Current system includes: - Overworld loop - Battle system
(deterministic) - Hero AI (personality-driven) - Player command UX +
feedback - Hero progression & skills - React + Phaser integration

Your task is to implement **Enemy AI Variation & Archetype System**.

This transforms enemies from: - passive targets

into: - distinct, strategic opponents

------------------------------------------------------------------------

## DOCUMENT PRIORITY

1.  TDD → architecture (STRICT)
2.  PRD → scope
3.  GDD → gameplay feel
4.  This prompt → execution

------------------------------------------------------------------------

## GOAL

Create enemy behaviors that:

-   feel different across encounters
-   challenge player strategy
-   interact meaningfully with hero AI system
-   remain deterministic and debuggable

------------------------------------------------------------------------

## CORE PRINCIPLES

1)  **ARCHETYPE-DRIVEN**

-   Enemy behavior defined by archetype, not randomness

2)  **CONSISTENT**

-   Same archetype behaves similarly across battles

3)  **READABLE**

-   Player can learn patterns

4)  **AI-SYMMETRY**

-   Enemy uses same decision pipeline (summary → decision → intent)

------------------------------------------------------------------------

# SYSTEM OVERVIEW

``` text
Enemy Archetype
  ↓
Behavior Profile
  ↓
Decision Logic
  ↓
Intent
  ↓
Same Execution System
```

------------------------------------------------------------------------

## STEP 1 --- ENEMY ARCHETYPE TYPES

Create:

``` ts
export type EnemyArchetype =
  | "aggressive_rusher"
  | "defensive_holder"
  | "sniper_controller"
  | "support_buffer"
  | "swarm_pack";
```

------------------------------------------------------------------------

## STEP 2 --- ENEMY DATA

File: `data/enemies.ts`

``` ts
export const ENEMIES = {
  grunt_rusher: {
    id: "grunt_rusher",
    archetype: "aggressive_rusher",
    stats: {
      maxHp: 80,
      attack: 12,
      defense: 3,
      moveSpeed: 2.5
    }
  },

  shield_guard: {
    id: "shield_guard",
    archetype: "defensive_holder",
    stats: {
      maxHp: 120,
      attack: 6,
      defense: 10,
      moveSpeed: 1.5
    }
  }
};
```

------------------------------------------------------------------------

## STEP 3 --- ENEMY AI PROVIDER

Create:

``` ts
EnemyDecisionProvider.ts
EnemyArchetypeBrain.ts
```

This mirrors hero AI, but uses **fixed archetype logic**.

------------------------------------------------------------------------

## STEP 4 --- ARCHETYPE BEHAVIOR LOGIC

### Aggressive Rusher

-   always push forward
-   prioritize nearest target
-   ignore defense

``` ts
if(enemyNearby){
  intent = "advance_to_point"
}
```

------------------------------------------------------------------------

### Defensive Holder

-   hold position
-   protect key area
-   retaliate when attacked

``` ts
if(threatened){
  intent = "focus_enemy"
}else{
  intent = "hold_position"
}
```

------------------------------------------------------------------------

### Sniper Controller

-   stay at range
-   target weakest unit
-   reposition if threatened

------------------------------------------------------------------------

### Support Buffer

-   stay behind
-   buff allies
-   avoid direct combat

------------------------------------------------------------------------

### Swarm Pack

-   group behavior
-   surround enemy
-   overwhelm target

------------------------------------------------------------------------

## STEP 5 --- SHARED DECISION PIPELINE

Enemy AI must use same flow:

``` text
Summary → Decision → Intent → Executor
```

Do NOT create separate execution logic.

------------------------------------------------------------------------

## STEP 6 --- ENEMY SUMMARY BUILDER

Create:

``` ts
EnemySummaryBuilder.ts
```

Similar to hero summary but simpler:

``` ts
type EnemySummary = {
  self
  nearbyAllies
  nearbyEnemies
}
```

------------------------------------------------------------------------

## STEP 7 --- GROUP BEHAVIOR (SWARM)

For swarm archetype:

-   share target across group
-   move toward same point

Simple approach: - assign leader - others follow leader target

------------------------------------------------------------------------

## STEP 8 --- SKILL USAGE (OPTIONAL SIMPLE)

Enemies can use skills:

-   use predefined conditions
-   no personality scoring

Example: - heal when hp \< 40% - attack skill when in range

------------------------------------------------------------------------

## STEP 9 --- BALANCE CONTROL

Create config:

``` ts
enemyBehaviorWeights.ts
```

Adjust: - aggression level - retreat threshold - target preference

------------------------------------------------------------------------

## STEP 10 --- DEBUG VISIBILITY

Display:

-   enemy archetype
-   current intent
-   target

------------------------------------------------------------------------

## STEP 11 --- ENCOUNTER VARIATION

Update encounter system:

``` ts
EnemyGroup = {
  units: string[],
  archetypes: EnemyArchetype[]
}
```

Mix archetypes per encounter.

------------------------------------------------------------------------

## STEP 12 --- DIFFICULTY SCALING

Simple scaling:

-   increase stats
-   mix archetypes
-   increase unit count

No dynamic scaling yet.

------------------------------------------------------------------------

## WHAT NOT TO DO

-   no complex coordination AI
-   no randomness-heavy logic
-   no new systems outside AI layer

------------------------------------------------------------------------

## SUCCESS CRITERIA

-   enemies behave differently by archetype
-   patterns are learnable
-   battles feel varied
-   system remains deterministic

------------------------------------------------------------------------

## FINAL INSTRUCTION

Build enemies that feel:

-   intentional
-   distinct
-   understandable

This is where combat becomes:

👉 strategic, not repetitive
