# Living Heros --- Prompt #3: Hero Intelligence & Personality System (FULL --- Phaser 3 + TypeScript)

## CONTEXT

You are extending the existing **Living Heros** project built with:

-   Phaser 3 (game runtime)
-   React (UI layer)
-   TypeScript (strict typing)
-   Vite (build tool)

The project already has (from Prompt #2): - deterministic battle loop
(Movement, Targeting, Combat) - BattleScene update loop wired - Unit &
Hero entities - HeroScheduler - HeroSummaryBuilder -
LocalRuleBasedHeroBrain (basic) - IntentExecutor - basic debug UI hooks

Your task is to upgrade the **Hero Intelligence layer** to be: -
personality-driven - consistent and explainable - scheduler-based (no
per-frame thinking) - fully compatible with future BitNet integration

------------------------------------------------------------------------

## DOCUMENT PRIORITY (MANDATORY)

1.  **TDD** → architecture and contracts (STRICT)
2.  **PRD** → scope
3.  **GDD** → gameplay feel
4.  This prompt → execution

If conflict exists → follow **TDD**.

------------------------------------------------------------------------

## GOAL

Implement a **Personality-Driven Decision System** that:

-   evaluates multiple candidate intents
-   scores them using heuristics + personality traits
-   selects a stable, explainable decision
-   outputs a strict `HeroDecision`
-   integrates with existing Scheduler → Executor pipeline

------------------------------------------------------------------------

## CRITICAL RULES

1)  **INTENT-ONLY OUTPUT**

-   AI outputs structured intent ONLY
-   No direct control of simulation or units

2)  **NO PER-FRAME AI**

-   Decisions only via `HeroScheduler`

3)  **DETERMINISTIC EXECUTION**

-   Personality affects *choice*, not simulation rules

4)  **SCHEMA STABILITY**

-   Keep `HeroSummary` and `HeroDecision` schemas stable
-   Extend via optional fields if necessary

5)  **TYPE SAFETY (MANDATORY)**

-   Use strict TypeScript types (no `any`)
-   Centralize types in `game/phaser/ai/types.ts`

------------------------------------------------------------------------

# SYSTEM OVERVIEW

``` text
HeroSummary (TS)
  ↓
Candidate Generation
  ↓
Scoring (Heuristics + Personality)
  ↓
Selection (with stability / hysteresis)
  ↓
HeroDecision (TS)
  ↓
IntentExecutor
```

------------------------------------------------------------------------

## STEP 1 --- TYPE DEFINITIONS (MANDATORY)

Create/extend in `ai/types.ts`:

``` ts
export type Vec2 = { x: number; y: number };

export type PlayerCommand = {
  type: "protect" | "hold" | "advance" | "focus";
  targetId?: string;
};

export type AllySummary = {
  id: string;
  class: string;
  count: number;
  hpPctAvg: number;
  position: Vec2;
};

export type EnemySummary = {
  id: string;
  class: string;
  count: number;
  hpPctAvg: number;
  position: Vec2;
  threatLevel: "low" | "medium" | "high";
};

export type TerrainSummary = {
  localTags: string[];
  movementConstraints: {
    north: "clear" | "blocked" | string;
    south: "clear" | "blocked" | string;
    east: "clear" | "blocked" | string;
    west: "clear" | "blocked" | string;
  };
};

export type HeroSummary = {
  heroId: string;
  currentTimeSec: number;
  playerOrder?: PlayerCommand;
  self: {
    hpPct: number;
    position: Vec2;
    statusEffects: string[];
  };
  nearbyAllies: AllySummary[];
  nearbyEnemies: EnemySummary[];
  terrain: TerrainSummary;
  lastDecision?: {
    intent: IntentType;
    ageSec: number;
  };
};

export type IntentType =
  | "hold_position"
  | "advance_to_point"
  | "protect_target"
  | "focus_enemy"
  | "retreat_to_point"
  | "use_skill";

export type HeroDecision = {
  intent: IntentType;
  targetId?: string;
  moveTo?: Vec2;
  skillId?: string;
  priority: "low" | "medium" | "high";
  rationaleTag: string;
  recheckInSec: number;
};

export type HeroTraits = {
  intelligence: number; // 0–100
  discipline: number;   // 0–100
  boldness: number;     // 0–100
  caution: number;      // 0–100
  empathy: number;      // 0–100
  decisiveness: number; // 0–100
};
```

------------------------------------------------------------------------

## STEP 2 --- PERSONALITY MODEL

Extend hero data (`data/heroes.ts`) with:

``` ts
traits: HeroTraits
aiProfile: string // preset name
```

### Trait Effects (guidelines)

-   **intelligence**: candidate breadth + target quality
-   **discipline**: weight of `playerOrder`
-   **boldness**: preference for advancing/engaging
-   **caution**: preference for holding/retreating
-   **empathy**: protecting allies vs chasing enemies
-   **decisiveness**: commitment duration (less flip-flopping)

------------------------------------------------------------------------

## STEP 3 --- CANDIDATE GENERATION

Create `ai/candidates.ts`:

Generate a list of **candidate intents** (no selection yet):

``` ts
type Candidate = {
  intent: IntentType;
  targetId?: string;
  moveTo?: Vec2;
  skillId?: string;
};
```

Generate candidates based on `HeroSummary`:

-   `hold_position`
-   `advance_to_point` (toward nearest enemy or objective)
-   `protect_target` (most threatened ally or commanded target)
-   `focus_enemy` (highest threat / lowest hp enemy)
-   `retreat_to_point` (safe point away from threats)
-   `use_skill` (only if available & contextually relevant)

Helper functions: - `getNearestEnemy(summary)` -
`getMostThreatenedAlly(summary)` - `getSafePoint(summary)` -
`getForwardPoint(summary)`

------------------------------------------------------------------------

## STEP 4 --- SCORING ENGINE

Create `ai/scoring.ts`.

### Base Heuristic

``` ts
function baseScore(c: Candidate, s: HeroSummary): number {
  switch (c.intent) {
    case "advance_to_point":
      return s.nearbyEnemies.length > 0 ? 10 : 0;
    case "protect_target":
      return s.nearbyAllies.length > 0 ? 8 : 0;
    case "focus_enemy":
      return 9;
    case "retreat_to_point":
      return s.self.hpPct < 40 ? 12 : 2;
    case "hold_position":
      return 5;
    case "use_skill":
      return 6;
  }
}
```

### Personality Modifiers

``` ts
function personalityScore(c: Candidate, s: HeroSummary, t: HeroTraits): number {
  let score = 0;

  const scale = (v: number, min: number, max: number) =>
    min + (v / 100) * (max - min);

  if (c.intent === "advance_to_point") {
    score += scale(t.boldness, -10, +15);
    score -= scale(t.caution, 0, +12);
  }

  if (c.intent === "retreat_to_point") {
    score += scale(t.caution, -5, +20);
    score -= scale(t.boldness, 0, +10);
  }

  if (c.intent === "protect_target") {
    score += scale(t.empathy, -5, +18);
  }

  if (c.intent === "focus_enemy") {
    score += scale(t.boldness, -3, +12);
  }

  if (c.intent === "hold_position") {
    score += scale(t.discipline, -2, +10);
  }

  return score;
}
```

### Player Order Influence

``` ts
function commandBoost(c: Candidate, s: HeroSummary, t: HeroTraits): number {
  if (!s.playerOrder) return 0;

  const scale = (v: number, min: number, max: number) =>
    min + (v / 100) * (max - min);

  switch (s.playerOrder.type) {
    case "protect":
      return c.intent === "protect_target" ? scale(t.discipline, 0, 15) : 0;
    case "advance":
      return c.intent === "advance_to_point" ? scale(t.discipline, 0, 12) : 0;
    case "hold":
      return c.intent === "hold_position" ? scale(t.discipline, 0, 10) : 0;
    case "focus":
      return c.intent === "focus_enemy" ? scale(t.discipline, 0, 12) : 0;
  }
}
```

### Final Score

``` ts
function totalScore(c: Candidate, s: HeroSummary, t: HeroTraits): number {
  return baseScore(c, s)
       + personalityScore(c, s, t)
       + commandBoost(c, s, t);
}
```

------------------------------------------------------------------------

## STEP 5 --- SELECTION WITH STABILITY

Create `ai/selector.ts`.

-   Compute scores for all candidates
-   Keep previous intent if close (hysteresis)

``` ts
const SWITCH_THRESHOLD = 5;

function selectBest(
  candidates: Candidate[],
  scores: number[],
  last?: HeroDecision
): Candidate {
  const bestIndex = scores.indexOf(Math.max(...scores));
  const best = candidates[bestIndex];

  if (last) {
    const lastIndex = candidates.findIndex(c => c.intent === last.intent);
    if (lastIndex >= 0) {
      const delta = scores[bestIndex] - scores[lastIndex];
      if (delta < SWITCH_THRESHOLD) {
        return candidates[lastIndex];
      }
    }
  }

  return best;
}
```

------------------------------------------------------------------------

## STEP 6 --- COMMITMENT (DECISIVENESS)

Map decisiveness → minimum hold time:

``` ts
function minHoldTimeSec(decisiveness: number): number {
  return 1 + (decisiveness / 100) * 3; // 1s → 4s
}
```

Scheduler must: - avoid switching before `minHoldTimeSec` - still allow
emergency overrides (e.g., hp \< 20%)

------------------------------------------------------------------------

## STEP 7 --- BUILD FINAL DECISION

Create `ai/decisionBuilder.ts`.

``` ts
function toDecision(c: Candidate, traits: HeroTraits): HeroDecision {
  const recheckInSec = 1 + (100 - traits.decisiveness) / 50; // 1–3s

  return {
    intent: c.intent,
    targetId: c.targetId,
    moveTo: c.moveTo,
    skillId: c.skillId,
    priority: "medium",
    rationaleTag: buildRationale(c),
    recheckInSec
  };
}
```

### Rationale Tags (REQUIRED)

Implement `buildRationale`:

-   "protect_archers"
-   "advance_with_advantage"
-   "retreat_low_hp"
-   "hold_bridge"
-   "focus_weak_target"

Used by debug UI + player feedback.

------------------------------------------------------------------------

## STEP 8 --- SKILL USAGE

Only generate `use_skill` candidates if: - off cooldown - context
relevant

Score by: - situation fit - empathy (defensive skills) - boldness
(offensive skills)

------------------------------------------------------------------------

## STEP 9 --- ERROR HANDLING

Before returning:

-   validate `targetId` exists
-   clamp `moveTo` inside map bounds
-   ensure `skillId` is usable

Fallback:

``` ts
{ intent: "hold_position", priority: "low", rationaleTag: "fallback_safe", recheckInSec: 2 }
```

------------------------------------------------------------------------

## STEP 10 --- DEBUG OVERLAY (MANDATORY)

Extend debug UI (React panel or Phaser overlay):

Display: - current intent - top 3 candidates + scores - rationaleTag -
time to next recheck - playerOrder

Optional: - toggle to print full candidate table

------------------------------------------------------------------------

## STEP 11 --- CONFIG / TUNING

Create `ai/config.ts`:

``` ts
export const AI_CONFIG = {
  switchThreshold: 5,
  advanceBoldnessScale: 0.15,
  retreatCautionScale: 0.20,
  protectEmpathyScale: 0.18,
  disciplineOrderScale: 0.12
};
```

Avoid magic numbers in logic files.

------------------------------------------------------------------------

## STEP 12 --- PERSONALITY PRESETS

In `data/heroes.ts` define presets:

-   balanced_defender
-   aggressive_commander
-   cautious_guardian
-   reckless_raider
-   support_captain

Each preset sets default `HeroTraits`.

------------------------------------------------------------------------

## STEP 13 --- INTEGRATION

-   Keep `HeroDecisionProvider.getDecision(summary)` unchanged
-   Replace simple brain with `ScoredPersonalityBrain`
-   Keep `HeroScheduler` and `IntentExecutor` unchanged

------------------------------------------------------------------------

## WHAT NOT TO DO

-   Do NOT integrate BitNet yet
-   Do NOT modify battle loop
-   Do NOT add new gameplay systems
-   Do NOT overcomplicate math
-   Do NOT remove debug visibility

------------------------------------------------------------------------

## SUCCESS CRITERIA

-   Different heroes behave noticeably differently
-   Same hero behaves consistently across runs
-   Player commands influence outcomes (via discipline)
-   Decisions are explainable (rationaleTag)
-   No regression in architecture

------------------------------------------------------------------------

## FINAL INSTRUCTION

Implement a **clear, debuggable, personality-driven decision system**
that is:

-   simple to reason about
-   stable in behavior
-   easy to tune
-   fully replaceable by BitNet later

Prioritize clarity and consistency over cleverness.
