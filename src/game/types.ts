// ── Position ──
export interface Position {
  x: number;
  y: number;
}

// ── Unit types ──
export type UnitFaction = 'allied' | 'enemy';
export type UnitRole = 'warrior' | 'archer';
export type UnitAnimState = 'idle' | 'moving' | 'attacking' | 'dead';

export interface UnitConfig {
  role: UnitRole;
  hp: number;
  attack: number;
  attackRange: number;
  attackSpeed: number; // attacks per second
  moveSpeed: number;   // pixels per second
}

export interface UnitState {
  id: string;
  faction: UnitFaction;
  role: UnitRole;
  position: Position;
  hp: number;
  maxHp: number;
  attack: number;
  attackRange: number;
  attackSpeed: number;
  moveSpeed: number;
  targetId?: string;
  state: UnitAnimState;
}

// ── Hero types ──
export interface HeroTraits {
  intelligence: number; // 0-1: candidate breadth + target quality
  discipline: number;   // 0-1: how closely hero follows commands
  boldness: number;     // 0-1: aggression level
  caution: number;      // 0-1: risk avoidance
  empathy: number;      // 0-1: protecting allies vs chasing enemies
  decisiveness: number; // 0-1: commitment duration (less flip-flopping)
}

export interface HeroConfig {
  id: string;
  name: string;
  traits: HeroTraits;
}

export interface HeroState {
  id: string;
  name: string;
  position: Position;
  currentCommand?: PlayerCommand;
  currentDecision?: HeroDecision;
  traits: HeroTraits;
}

// ── Command types ──
export type CommandType = 'protect' | 'hold' | 'advance' | 'focus';

export interface PlayerCommand {
  type: CommandType;
  targetId?: string;
}

// ── AI types ──
export type IntentType =
  | 'hold_position'
  | 'advance_to_point'
  | 'protect_target'
  | 'focus_enemy'
  | 'retreat_to_point'
  | 'use_skill';

export interface HeroDecision {
  intent: IntentType;
  targetId?: string;
  moveTo?: Position;
  skillId?: string;
  priority: 'low' | 'medium' | 'high';
  rationaleTag: string;
  recheckInSec: number;
}

export interface HeroSummary {
  heroState: HeroState;
  currentCommand?: PlayerCommand;
  nearbyAllies: UnitState[];
  nearbyEnemies: UnitState[];
  battlePhase: BattlePhase;
  timeSec: number;
}

// ── Battle types ──
export type BattlePhase = 'init' | 'active' | 'ended';

export interface BattleState {
  timeSec: number;
  phase: BattlePhase;
  alliedUnits: UnitState[];
  enemyUnits: UnitState[];
  heroes: HeroState[];
}

export type BattleResult = 'allied_win' | 'enemy_win' | null;

// ── Skill types (placeholder) ──
export interface SkillConfig {
  id: string;
  name: string;
  damage: number;
  range: number;
  cooldown: number;
}

// ── Overworld types ──
export interface OverworldNode {
  id: string;
  position: Position;
  label: string;
  difficulty: number; // enemy count multiplier
  completed: boolean;
}
