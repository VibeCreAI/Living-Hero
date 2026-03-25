# Living Heros --- Prompt #2: Battle System Implementation (FULL --- Phaser 3 + TypeScript)

## CONTEXT

You are continuing development of **Living Heros** using:

-   Phaser 3 (game engine)
-   React (UI layer)
-   TypeScript (strict typing)
-   Vite (build tool)

The project already includes: - project scaffold - scenes (Boot,
Overworld, Battle) - basic entities - initial UI shell

You must now implement the **core battle system** following the TDD.

------------------------------------------------------------------------

## DOCUMENT PRIORITY

1.  TDD → architecture (STRICT)
2.  PRD → scope
3.  GDD → gameplay feel
4.  This prompt → execution

------------------------------------------------------------------------

## GOAL

Build a **deterministic, scalable battle system** that supports:

-   real-time combat
-   AI-driven hero decisions
-   future BitNet integration
-   replay compatibility
-   async PvP compatibility

------------------------------------------------------------------------

## CRITICAL RULES

### 1. AI-AGNOSTIC SIMULATION

-   AI does NOT control simulation
-   AI outputs intent only
-   simulation executes deterministically

### 2. NO PER-FRAME AI

-   AI runs on scheduler only

### 3. DETERMINISM

-   combat + movement must be predictable

### 4. SEPARATION

-   Phaser handles loop/render
-   systems handle logic
-   AI layer separate

------------------------------------------------------------------------

# CORE PIPELINE

Battle Loop → Scheduler → Summary → Decision → Intent → Systems

------------------------------------------------------------------------

## STEP 1 --- BATTLE STATE (TypeScript)

``` ts
type BattleState = {
  timeSec: number
  tick: number
  phase: "init" | "active" | "ended"

  alliedUnits: UnitState[]
  enemyUnits: UnitState[]
  heroes: HeroState[]

  selectedEntityId?: string
}
```

------------------------------------------------------------------------

## STEP 2 --- UNIT SYSTEM

``` ts
type UnitState = {
  id: string
  team: "ally" | "enemy"

  position: {x:number,y:number}
  hp: number
  maxHp: number

  attack: number
  defense: number

  moveSpeed: number
  attackRange: number

  targetId?: string
  state: "idle"|"moving"|"attacking"|"dead"

  cooldown: number
}
```

Rules: - deterministic - no AI inside units

------------------------------------------------------------------------

## STEP 3 --- MOVEMENT SYSTEM

File: `MovementSystem.ts`

Responsibilities: - move toward target - update position - clamp bounds

------------------------------------------------------------------------

## STEP 4 --- TARGETING SYSTEM

File: `TargetingSystem.ts`

-   assign nearest enemy
-   update on death

------------------------------------------------------------------------

## STEP 5 --- COMBAT SYSTEM

File: `CombatSystem.ts`

-   check range
-   apply damage
-   handle cooldown
-   mark dead

------------------------------------------------------------------------

## STEP 6 --- HERO SCHEDULER

File: `HeroScheduler.ts`

Triggers: - battle start - command change - HP threshold - timer

Flow:

``` ts
if(trigger){
  summary = buildSummary()
  decision = provider.getDecision()
  executor.execute()
}
```

------------------------------------------------------------------------

## STEP 7 --- SUMMARY BUILDER

File: `HeroSummaryBuilder.ts`

``` ts
type HeroSummary = {
  self
  nearbyAllies
  nearbyEnemies
  terrain
  playerOrder
  lastDecision
}
```

------------------------------------------------------------------------

## STEP 8 --- DECISION PROVIDER

Files: - HeroDecisionProvider.ts - LocalRuleBasedHeroBrain.ts

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

## STEP 9 --- INTENT EXECUTOR

File: `IntentExecutor.ts`

-   validate intent
-   convert → movement/target
-   clamp invalid data

------------------------------------------------------------------------

## STEP 10 --- PHASER LOOP

Inside BattleScene:

``` ts
update(dt){
  commandSystem.update()
  heroScheduler.update()
  movementSystem.update()
  targetingSystem.update()
  combatSystem.update()
  checkWinCondition()
}
```

------------------------------------------------------------------------

## STEP 11 --- WIN CONDITION

-   all enemies dead → win
-   all allies dead → lose

------------------------------------------------------------------------

## STEP 12 --- DEBUG UI

Display: - hero intent - selected unit - decision logs

------------------------------------------------------------------------

## WHAT NOT TO BUILD

-   no gacha
-   no PvP
-   no BitNet
-   no complex pathfinding

------------------------------------------------------------------------

## SUCCESS CRITERIA

-   battle runs smoothly
-   AI affects outcome
-   architecture clean
-   systems modular

------------------------------------------------------------------------

## FINAL

Build clean, not complex.
