# Living Heros --- Prompt #8: Async PvP Foundation (Replay + Simulation System) (FULL --- Phaser 3 + TypeScript)

## CONTEXT

You are extending Living Heros after Prompt #7.

Current system includes: - Overworld loop - Deterministic battle
system - Hero AI (personality-driven) - Player command UX + feedback -
Hero progression & skills - Enemy AI archetypes - React + Phaser
integration

Your task is to implement the **Async PvP Foundation**, focusing on:

-   deterministic replay system
-   battle state serialization
-   defender setup recording
-   attacker playback simulation

------------------------------------------------------------------------

## DOCUMENT PRIORITY

1.  TDD → architecture (STRICT)
2.  PRD → scope
3.  GDD → gameplay feel
4.  This prompt → execution

------------------------------------------------------------------------

## GOAL

Build a system where:

-   battles can be fully replayed deterministically
-   defender setups can be stored
-   attacker can replay battle locally
-   system is future-ready for PvP

------------------------------------------------------------------------

## CORE PRINCIPLES

1)  **DETERMINISTIC FIRST**

-   Same input → same result

2)  **EVENT-DRIVEN**

-   Record decisions, not frames

3)  **LIGHTWEIGHT DATA**

-   Store minimal necessary info

4)  **ENGINE-AGNOSTIC DATA**

-   Replay data independent of Phaser rendering

------------------------------------------------------------------------

# SYSTEM OVERVIEW

``` text
Battle Simulation
  ↓
Event Log Recording
  ↓
Replay Data
  ↓
Replay Engine
  ↓
Battle Playback
```

------------------------------------------------------------------------

## STEP 1 --- REPLAY DATA STRUCTURE

Create:

``` ts
type ReplayEvent =
  | { type: "command"; time: number; command: PlayerCommand }
  | { type: "decision"; time: number; heroId: string; decision: HeroDecision }

type ReplayData = {
  seed: number
  duration: number
  events: ReplayEvent[]
}
```

------------------------------------------------------------------------

## STEP 2 --- DETERMINISM REQUIREMENTS

Ensure:

-   no Math.random without seed
-   fixed timestep
-   consistent update order

Optional:

``` ts
seededRandom(seed)
```

------------------------------------------------------------------------

## STEP 3 --- EVENT LOGGING

During battle:

Record: - player commands - hero decisions

``` ts
replay.events.push({
  type: "decision",
  time: currentTime,
  heroId,
  decision
})
```

------------------------------------------------------------------------

## STEP 4 --- REPLAY MANAGER

Create:

``` ts
ReplayManager.ts
```

Responsibilities: - start recording - store events - export ReplayData -
load replay

------------------------------------------------------------------------

## STEP 5 --- PLAYBACK SYSTEM

Create:

``` ts
ReplayPlayer.ts
```

Responsibilities: - read ReplayData - inject commands/decisions at
correct time - run simulation normally

------------------------------------------------------------------------

## STEP 6 --- BATTLE SCENE MODE

BattleScene must support:

``` ts
mode: "live" | "replay"
```

-   live → normal AI
-   replay → inject recorded decisions

------------------------------------------------------------------------

## STEP 7 --- DEFENDER SNAPSHOT

Create:

``` ts
type DefenderSetup = {
  heroState
  units
  formation
}
```

Stored before battle.

------------------------------------------------------------------------

## STEP 8 --- ATTACK FLOW

``` text
Load DefenderSetup
→ Start BattleScene
→ Run Replay or Live Simulation
```

------------------------------------------------------------------------

## STEP 9 --- UI (REACT)

Replay UI:

-   play / pause
-   speed control (1x, 2x, 4x)
-   timeline scrub (optional simple)

------------------------------------------------------------------------

## STEP 10 --- DEBUG

Display:

-   replay time
-   current event index
-   injected decisions

------------------------------------------------------------------------

## STEP 11 --- FILE STORAGE (LOCAL)

For now:

-   store replay in memory OR localStorage
-   no backend required

------------------------------------------------------------------------

## STEP 12 --- VALIDATION

Test:

-   same replay produces same outcome
-   no divergence

------------------------------------------------------------------------

## WHAT NOT TO DO

-   no networking yet
-   no matchmaking
-   no ranking system
-   no server sync

------------------------------------------------------------------------

## SUCCESS CRITERIA

-   replay plays correctly
-   outcomes match original
-   system stable and deterministic
-   foundation ready for PvP

------------------------------------------------------------------------

## FINAL INSTRUCTION

Build a **deterministic replay foundation**.

This enables:

👉 Async PvP\
👉 Content sharing\
👉 Debugging AI behavior

This is one of the most critical systems for scaling the game.
