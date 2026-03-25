# Living Heros --- Prompt #6: Hero Progression & Skill System (FULL --- Phaser 3 + TypeScript)

## CONTEXT

You are extending Living Heros after Prompt #5.

Current system includes: - Overworld loop (enter/exit battles) -
Deterministic battle system - Hero AI (personality-driven) - Player
command UX + feedback - React + Phaser integration

Your task is to implement the **Hero Progression & Skill System**.

This adds: - long-term progression - meaningful hero differentiation -
deeper battle decisions (via skills)

------------------------------------------------------------------------

## DOCUMENT PRIORITY

1.  TDD → architecture (STRICT)
2.  PRD → scope
3.  GDD → player experience
4.  This prompt → execution

------------------------------------------------------------------------

## GOAL

Create a system where:

-   Heroes gain XP and level up
-   Stats scale in a controlled way
-   Heroes have skills with cooldowns and effects
-   Skills integrate with AI decision-making
-   System is deterministic and data-driven

------------------------------------------------------------------------

## CORE PRINCIPLES

1)  **DATA-DRIVEN**

-   All heroes, stats, and skills defined in data files

2)  **DETERMINISTIC**

-   No hidden randomness in outcomes

3)  **AI-COMPATIBLE**

-   Skills must be selectable via HeroDecision

4)  **SIMPLE FIRST**

-   Minimal viable progression, expandable later

------------------------------------------------------------------------

# SYSTEM OVERVIEW

``` text
Battle Result
  ↓
XP Gain
  ↓
Level Up
  ↓
Stat Update
  ↓
Skill Availability
  ↓
AI Uses Skills in Battle
```

------------------------------------------------------------------------

## STEP 1 --- TYPE DEFINITIONS

Create/extend in `game/phaser/ai/types.ts` and
`game/phaser/state/types.ts`:

``` ts
export type HeroStats = {
  maxHp: number;
  attack: number;
  defense: number;
  moveSpeed: number;
};

export type HeroProgression = {
  level: number;
  xp: number;
  xpToNext: number;
};

export type SkillEffectType =
  | "damage"
  | "heal"
  | "buff"
  | "debuff"
  | "dash";

export type SkillTargetType =
  | "self"
  | "ally"
  | "enemy"
  | "area";

export type SkillDefinition = {
  id: string;
  name: string;
  description: string;

  cooldownSec: number;
  range: number;

  targetType: SkillTargetType;
  effectType: SkillEffectType;

  power: number; // meaning depends on effectType
  durationSec?: number;

  tags?: string[]; // e.g., ["defensive", "offensive"]
};

export type HeroSkillState = {
  skillId: string;
  cooldownRemaining: number;
};

export type HeroState = {
  id: string;
  name: string;

  position: { x: number; y: number };

  stats: HeroStats;
  progression: HeroProgression;

  skills: HeroSkillState[];
  traits: import("./types").HeroTraits;

  lastDecision?: import("./types").HeroDecision;
};
```

------------------------------------------------------------------------

## STEP 2 --- HERO DATA (DATA-DRIVEN)

File: `game/phaser/data/heroes.ts`

``` ts
export const HEROES = {
  alden: {
    id: "alden",
    name: "Alden",

    baseStats: {
      maxHp: 120,
      attack: 10,
      defense: 6,
      moveSpeed: 2.0
    },

    traits: {
      intelligence: 70,
      discipline: 80,
      boldness: 60,
      caution: 40,
      empathy: 60,
      decisiveness: 65
    },

    startingSkills: ["shield_wall"]
  }
};
```

------------------------------------------------------------------------

## STEP 3 --- SKILL DATA

File: `game/phaser/data/skills.ts`

``` ts
export const SKILLS: Record<string, SkillDefinition> = {
  shield_wall: {
    id: "shield_wall",
    name: "Shield Wall",
    description: "Reduce incoming damage for nearby allies",

    cooldownSec: 10,
    range: 3,

    targetType: "ally",
    effectType: "buff",

    power: 0.5,
    durationSec: 3,

    tags: ["defensive"]
  },

  power_strike: {
    id: "power_strike",
    name: "Power Strike",
    description: "Deal heavy damage to a target",

    cooldownSec: 8,
    range: 2,

    targetType: "enemy",
    effectType: "damage",

    power: 20,

    tags: ["offensive"]
  }
};
```

------------------------------------------------------------------------

## STEP 4 --- XP & LEVELING SYSTEM

Create `systems/ProgressionSystem.ts`

### XP Gain

Prototype rule:

``` ts
xpGained = numberOfEnemiesDefeated * 10
```

### Level Curve

``` ts
function xpToNext(level: number): number {
  return 50 + level * 25;
}
```

### Level Up

``` ts
while (hero.progression.xp >= hero.progression.xpToNext) {
  hero.progression.xp -= hero.progression.xpToNext;
  hero.progression.level += 1;
  hero.progression.xpToNext = xpToNext(hero.progression.level);

  applyLevelUpStats(hero);
}
```

------------------------------------------------------------------------

## STEP 5 --- STAT SCALING

``` ts
function applyLevelUpStats(hero: HeroState) {
  hero.stats.maxHp += 10;
  hero.stats.attack += 2;
  hero.stats.defense += 1;
}
```

Rules: - linear scaling (simple for Prototype 0) - no randomness

------------------------------------------------------------------------

## STEP 6 --- SKILL COOLDOWN SYSTEM

Create `systems/SkillSystem.ts`

Each update:

``` ts
for (const skill of hero.skills) {
  skill.cooldownRemaining = Math.max(0, skill.cooldownRemaining - dt);
}
```

------------------------------------------------------------------------

## STEP 7 --- SKILL EXECUTION

Extend `IntentExecutor.ts`

When decision.intent === "use_skill":

``` ts
function executeSkill(hero: HeroState, decision: HeroDecision) {
  const skill = SKILLS[decision.skillId];

  if (!skill) return;
  if (getCooldown(hero, skill.id) > 0) return;

  applySkillEffect(hero, skill, decision);

  setCooldown(hero, skill.id, skill.cooldownSec);
}
```

------------------------------------------------------------------------

## STEP 8 --- SKILL EFFECTS

Create `systems/SkillEffects.ts`

### Damage

``` ts
target.hp -= skill.power;
```

### Heal

``` ts
target.hp = Math.min(target.maxHp, target.hp + skill.power);
```

### Buff (example: defense boost)

``` ts
target.defense += skill.power;
```

Store temporary effects with duration.

------------------------------------------------------------------------

## STEP 9 --- AI INTEGRATION

Update candidate generation (Prompt #3):

-   Include `use_skill` candidates ONLY if:
    -   cooldownRemaining === 0
    -   valid target exists
    -   context matches skill tags

### Example logic

-   defensive skill → if ally hp \< 50%
-   offensive skill → if enemy in range

Scoring must include: - personality influence - context relevance

------------------------------------------------------------------------

## STEP 10 --- UI (REACT)

### Battle UI additions:

-   skill icons
-   cooldown indicators
-   skill activation feedback

### Hero Panel:

-   level
-   XP bar
-   stats

------------------------------------------------------------------------

## STEP 11 --- OVERWORLD INTEGRATION

After battle:

-   apply XP to hero
-   update level
-   persist HeroState

------------------------------------------------------------------------

## STEP 12 --- DEBUG TOOLS

Display:

-   hero level
-   XP gain per battle
-   skill cooldowns
-   skill usage logs

------------------------------------------------------------------------

## WHAT NOT TO DO

-   no skill trees yet
-   no complex status stacking
-   no RNG-based upgrades
-   no multiplayer sync

------------------------------------------------------------------------

## SUCCESS CRITERIA

-   hero gains XP after battle
-   level increases correctly
-   stats scale properly
-   skills activate and cooldown correctly
-   AI uses skills appropriately
-   UI reflects progression clearly

------------------------------------------------------------------------

## FINAL INSTRUCTION

Build a **simple, deterministic progression system** that:

-   enhances gameplay depth
-   integrates cleanly with AI
-   is easy to extend later

Focus on: - clarity - consistency - system integrity
