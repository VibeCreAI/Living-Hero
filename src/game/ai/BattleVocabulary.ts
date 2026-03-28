import { BattleObstacle, Position, UnitRole, UnitState } from '../types';

/**
 * Generates and manages short nicknames for units and spatial labels
 * so the LLM can reference targets/positions with concise tokens.
 *
 * Created once per battle, reused across all LLM calls.
 */

const WARRIOR_NAMES = ['Brute', 'Tank', 'Crusher', 'Bash', 'Ox', 'Ram', 'Fang', 'Iron'];
const ARCHER_NAMES = ['Sniper', 'Hawk', 'Arrow', 'Bolt', 'Viper', 'Ace', 'Dart', 'Flint'];
const HERO_NAMES = ['Chief', 'Warden', 'Captain', 'Marshal', 'Regent', 'Blade', 'Sage', 'Duke'];

const NAME_POOLS: Record<UnitRole, string[]> = {
  warrior: WARRIOR_NAMES,
  archer: ARCHER_NAMES,
  hero: HERO_NAMES,
};

export interface NicknameEntry {
  unitId: string;
  nickname: string;
  role: UnitRole;
  faction: UnitState['faction'];
}

export class BattleVocabulary {
  private idToNickname = new Map<string, string>();
  private nicknameToId = new Map<string, string>();
  private entries: NicknameEntry[] = [];

  /**
   * Assign nicknames to all units at battle start.
   * Call once when units are spawned.
   */
  assignNicknames(alliedUnits: UnitState[], enemyUnits: UnitState[]): void {
    this.idToNickname.clear();
    this.nicknameToId.clear();
    this.entries = [];

    const counters: Record<string, number> = {};

    for (const unit of [...alliedUnits, ...enemyUnits]) {
      const poolKey = `${unit.faction}-${unit.role}`;
      const pool = NAME_POOLS[unit.role] ?? WARRIOR_NAMES;
      const index = counters[poolKey] ?? 0;
      counters[poolKey] = index + 1;

      // Use displayName if already set, otherwise generate
      let nickname: string;
      if (unit.displayName) {
        nickname = unit.displayName;
      } else {
        nickname = index < pool.length ? pool[index] : `${pool[0]}${index + 1}`;
      }

      // Prefix with faction for clarity in the prompt
      const prefix = unit.faction === 'enemy' ? 'Enemy' : 'Ally';
      const fullNickname = `${prefix} ${nickname}`;

      this.idToNickname.set(unit.id, fullNickname);
      this.nicknameToId.set(fullNickname.toLowerCase(), unit.id);
      // Also allow matching without prefix
      this.nicknameToId.set(nickname.toLowerCase(), unit.id);

      this.entries.push({
        unitId: unit.id,
        nickname: fullNickname,
        role: unit.role,
        faction: unit.faction,
      });
    }
  }

  /** Get nickname for a unit ID */
  getNickname(unitId: string): string {
    return this.idToNickname.get(unitId) ?? unitId;
  }

  /** Resolve a nickname (from LLM output) back to a unit ID */
  resolveNickname(nickname: string): string | undefined {
    if (!nickname) return undefined;
    const lower = nickname.toLowerCase().trim();

    // Direct match
    const direct = this.nicknameToId.get(lower);
    if (direct) return direct;

    // Fuzzy: find longest substring match
    let bestId: string | undefined;
    let bestLength = 0;
    for (const [key, id] of this.nicknameToId) {
      if (lower.includes(key) && key.length > bestLength) {
        bestLength = key.length;
        bestId = id;
      }
      if (key.includes(lower) && lower.length > bestLength) {
        bestLength = lower.length;
        bestId = id;
      }
    }

    return bestId;
  }

  /** Get all entries (for debugging / display) */
  getAllEntries(): NicknameEntry[] {
    return this.entries;
  }
}

// ── Spatial label utilities ──

export type CardinalRegion =
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'center'
  | 'northeast'
  | 'northwest'
  | 'southeast'
  | 'southwest';

const MAP_WIDTH = 1024;
const MAP_HEIGHT = 768;

/** Convert a position to a cardinal region label */
export function positionToRegion(pos: Position): CardinalRegion {
  const xNorm = pos.x / MAP_WIDTH;
  const yNorm = pos.y / MAP_HEIGHT;

  const col = xNorm < 0.33 ? 'west' : xNorm > 0.66 ? 'east' : '';
  const row = yNorm < 0.33 ? 'north' : yNorm > 0.66 ? 'south' : '';

  if (col && row) return `${row}${col}` as CardinalRegion;
  if (col) return col as CardinalRegion;
  if (row) return row as CardinalRegion;
  return 'center';
}

/** Convert a cardinal region to approximate map coordinates */
export function regionToPosition(
  region: string,
  heroPosition?: Position
): Position | undefined {
  const r = region.toLowerCase().trim();
  const heroX = heroPosition?.x ?? MAP_WIDTH / 2;
  const heroY = heroPosition?.y ?? MAP_HEIGHT / 2;

  switch (r) {
    case 'north':
      return { x: heroX, y: MAP_HEIGHT * 0.17 };
    case 'south':
      return { x: heroX, y: MAP_HEIGHT * 0.83 };
    case 'east':
      return { x: MAP_WIDTH * 0.83, y: heroY };
    case 'west':
      return { x: MAP_WIDTH * 0.17, y: heroY };
    case 'center':
      return { x: MAP_WIDTH * 0.5, y: MAP_HEIGHT * 0.5 };
    case 'northeast':
      return { x: MAP_WIDTH * 0.8, y: MAP_HEIGHT * 0.2 };
    case 'northwest':
      return { x: MAP_WIDTH * 0.2, y: MAP_HEIGHT * 0.2 };
    case 'southeast':
      return { x: MAP_WIDTH * 0.8, y: MAP_HEIGHT * 0.8 };
    case 'southwest':
      return { x: MAP_WIDTH * 0.2, y: MAP_HEIGHT * 0.8 };
    default:
      return undefined;
  }
}

/** Get a directional label for an obstacle based on its map position */
export function obstacleDirectionLabel(obstacle: BattleObstacle): string {
  const center: Position = {
    x: obstacle.x + obstacle.width / 2,
    y: obstacle.y + obstacle.height / 2,
  };
  const region = positionToRegion(center);
  return `${region} ${obstacle.label}`;
}
