// Position
export interface Position {
  x: number;
  y: number;
}

// Unit types
export type UnitFaction = 'allied' | 'enemy';
export type UnitRole = 'warrior' | 'archer' | 'hero';
export type UnitAnimState = 'idle' | 'moving' | 'attacking' | 'dead';
export type UnitOrderMode = 'advance' | 'focus' | 'hold' | 'protect' | 'retreat';
export type UnitGroup = 'all' | 'hero' | 'warriors' | 'archers';

export interface UnitConfig {
  role: UnitRole;
  hp: number;
  attack: number;
  attackRange: number;
  attackSpeed: number; // attacks per second
  moveSpeed: number; // pixels per second
}

export interface UnitState {
  id: string;
  faction: UnitFaction;
  role: UnitRole;
  displayName?: string;
  assignedHeroId?: string;
  position: Position;
  hp: number;
  maxHp: number;
  attack: number;
  attackRange: number;
  attackSpeed: number;
  moveSpeed: number;
  targetId?: string;
  isPassive?: boolean;
  isInvulnerable?: boolean;
  orderMode?: UnitOrderMode;
  orderPoint?: Position;
  orderTargetId?: string;
  orderRadius?: number;
  orderLeashRadius?: number;
  orderPreferredTargetRole?: UnitRole;
  state: UnitAnimState;
}

// Hero types
export interface HeroTraits {
  intelligence: number; // 0-1: candidate breadth + target quality
  discipline: number; // 0-1: how closely hero follows commands
  boldness: number; // 0-1: aggression level
  caution: number; // 0-1: risk avoidance
  empathy: number; // 0-1: protecting allies vs chasing enemies
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
  combatUnitId: string;
  position: Position;
  currentDirective?: string;
  currentDecision?: HeroDecision;
  traits: HeroTraits;
}

// Command types
export type CommandType = 'protect' | 'hold' | 'advance' | 'focus';

export interface PlayerCommand {
  type: CommandType;
  targetId?: string;
}

// AI types
export type IntentType =
  | 'hold_position'
  | 'advance_to_point'
  | 'protect_target'
  | 'focus_enemy'
  | 'retreat_to_point'
  | 'use_skill';

export interface GroupOrder {
  group: UnitGroup;
  intent: IntentType;
  targetId?: string;
  moveTo?: Position;
}

export interface HeroDecision {
  intent: IntentType;
  targetId?: string;
  moveTo?: Position;
  skillId?: string;
  groupOrders?: GroupOrder[];
  groupOrderMode?: 'override' | 'explicit_only';
  priority: 'low' | 'medium' | 'high';
  rationaleTag: string;
  recheckInSec: number;
}

export interface DamageEvent {
  timeSec: number;
  attackerId: string;
  attackerFaction: UnitFaction;
  attackerRole: UnitRole;
  targetId: string;
  targetFaction: UnitFaction;
  targetRole: UnitRole;
  damage: number;
}

export interface BattleObstacle {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HeroSummary {
  mode: BattleMode;
  heroState: HeroState;
  heroUnit?: UnitState;
  currentDirective?: string;
  nearbyAllies: UnitState[];
  nearbyEnemies: UnitState[];
  obstacles: BattleObstacle[];
  recentDamage: DamageEvent[];
  battlePhase: BattlePhase;
  timeSec: number;
}

// Battle types
export type BattleMode = 'battle' | 'playground';
export type BattlePhase = 'init' | 'active' | 'ended';

export interface BattleState {
  mode: BattleMode;
  timeSec: number;
  phase: BattlePhase;
  alliedUnits: UnitState[];
  enemyUnits: UnitState[];
  heroes: HeroState[];
  obstacles: BattleObstacle[];
  recentDamage: DamageEvent[];
}

export type BattleResult = 'allied_win' | 'enemy_win' | null;

export interface BattleSummaryData {
  result: 'allied_win' | 'enemy_win';
  durationSec: number;
  alliedUnits: UnitState[];
  enemyUnits: UnitState[];
  heroes: HeroState[];
  allDamageEvents: DamageEvent[];
  aiStats: {
    llmCallCount: number;
    fallbackCount: number;
    lastLatencyMs: number;
  };
}

export interface PlayerChatMessageEvent {
  text: string;
  targetHeroIds: string[];
}

export interface HeroChatEvent {
  heroId: string;
  heroName: string;
  message: string;
}

// Skill types (placeholder)
export interface SkillConfig {
  id: string;
  name: string;
  damage: number;
  range: number;
  cooldown: number;
}

// Overworld types
export interface OverworldNode {
  id: string;
  position: Position;
  label: string;
  difficulty: number; // enemy count multiplier
  completed: boolean;
  mode?: BattleMode;
}
