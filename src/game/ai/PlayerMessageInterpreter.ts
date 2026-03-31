import { GroupOrder, HeroDecision, HeroSummary, TileCoord, UnitGroup, UnitState } from '../types';
import { chooseTacticalAnchor, resolveNamedObstacleAnchor, TacticalIntent } from './cover';

interface NamedLocation {
  name: string;
  tile: TileCoord;
}

interface ParsedGroupDecision {
  group: UnitGroup;
  decision: HeroDecision;
}

export function interpretPlayerMessage(
  summary: HeroSummary,
  playerMessage: string,
  terrainDescription?: string
): HeroDecision | null {
  return (
    interpretGroupedMessage(summary, playerMessage, terrainDescription) ??
    interpretAbstractSplitMessage(summary, playerMessage) ??
    interpretSingleMessage(summary, playerMessage, terrainDescription)
  );
}

function interpretGroupedMessage(
  summary: HeroSummary,
  playerMessage: string,
  terrainDescription?: string
): HeroDecision | null {
  const clauses = extractGroupClauses(playerMessage);
  if (clauses.length === 0) {
    return null;
  }

  const parsedOrders: ParsedGroupDecision[] = [];
  for (const clause of clauses) {
    const parsed = interpretSingleMessage(summary, clause.directive, terrainDescription);
    if (parsed) {
      parsedOrders.push({ group: clause.group, decision: parsed });
    }
  }

  if (parsedOrders.length === 0) {
    return null;
  }

  const primary = selectPrimaryGroupDecision(parsedOrders);
  return {
    intent: primary.decision.intent,
    targetId: primary.decision.targetId,
    moveToTile: primary.decision.moveToTile ? { ...primary.decision.moveToTile } : undefined,
    groupOrders: parsedOrders.map((entry) => buildGroupOrder(entry)),
    groupOrderMode: 'explicit_only',
    priority: highestPriority(parsedOrders.map((entry) => entry.decision.priority)),
    rationaleTag: 'parsed_group_orders',
    recheckInSec: Math.min(...parsedOrders.map((entry) => entry.decision.recheckInSec)),
  };
}

function interpretAbstractSplitMessage(
  summary: HeroSummary,
  playerMessage: string
): HeroDecision | null {
  const message = playerMessage.toLowerCase();
  if (!isAbstractSplitIntent(message)) {
    return null;
  }

  const aliveEnemies = summary.nearbyEnemies.filter((unit) => unit.state !== 'dead');
  const aliveAllies = summary.nearbyAllies.filter((unit) => unit.state !== 'dead');
  if (aliveEnemies.length === 0) {
    return null;
  }

  const isFocusIntent = containsAny(message, ['target', 'attack', 'focus', 'kill', 'fight']);
  const isDefensiveIntent = containsAny(message, ['defend', 'hold', 'guard', 'protect', 'cover']);

  if (isFocusIntent) {
    return buildSplitFocusOrders(summary, aliveEnemies, aliveAllies);
  }

  if (isDefensiveIntent) {
    return buildSplitDefensiveOrders(summary, aliveEnemies, aliveAllies);
  }

  return buildSplitFocusOrders(summary, aliveEnemies, aliveAllies);
}

const ABSTRACT_SPLIT_PATTERNS = [
  /\beach\s+(group|squad|unit)/,
  /\bdifferent\s+(target|enem|direction|position|area)/,
  /\bsplit\s+(up|them|attack|force|fire)/,
  /\bspread\s+(out|fire|attack)/,
  /\bassign\s+(different|separate|individual)/,
  /\beveryone\s+(target|attack|focus)\s+(a\s+)?different/,
  /\b(target|attack|focus)\s+different\s+(enem|target)/,
  /\bdivide\s+(and|the|your)/,
  /\bseparate\s+target/,
  /\bone\s+each/,
  /\bsurround\s+(them|the\s+enem)/,
  /\bflank\s+(and|from|them)/,
  /\bpincer/,
  /\bmulti.?prong/,
];

function isAbstractSplitIntent(message: string): boolean {
  return ABSTRACT_SPLIT_PATTERNS.some((pattern) => pattern.test(message));
}

function buildSplitFocusOrders(
  summary: HeroSummary,
  enemies: UnitState[],
  _allies: UnitState[]
): HeroDecision {
  const heroTile = summary.heroState.tile;
  const assigned = new Set<string>();
  const groupOrders: GroupOrder[] = [];
  const sortedByDistance = [...enemies].sort(
    (a, b) => tileDistance(a.tile, heroTile) - tileDistance(b.tile, heroTile)
  );

  const warriorTarget = pickTarget(enemies, assigned, 'warrior', heroTile);
  if (warriorTarget) {
    assigned.add(warriorTarget.id);
    groupOrders.push({
      group: 'warriors',
      intent: 'focus_enemy',
      targetId: warriorTarget.id,
      moveToTile: { ...warriorTarget.tile },
    });
  }

  const archerTarget = pickTarget(enemies, assigned, 'archer', heroTile);
  if (archerTarget) {
    assigned.add(archerTarget.id);
    groupOrders.push({
      group: 'archers',
      intent: 'focus_enemy',
      targetId: archerTarget.id,
      moveToTile: { ...archerTarget.tile },
    });
  }

  const heroTarget = pickWeakestUnassigned(enemies, assigned) ?? sortedByDistance[0];
  if (heroTarget) {
    assigned.add(heroTarget.id);
    groupOrders.push({
      group: 'hero',
      intent: 'focus_enemy',
      targetId: heroTarget.id,
      moveToTile: { ...heroTarget.tile },
    });
  }

  const primary = groupOrders[0];
  return {
    intent: 'focus_enemy',
    targetId: primary?.targetId,
    moveToTile: primary?.moveToTile ? { ...primary.moveToTile } : undefined,
    groupOrders,
    groupOrderMode: 'explicit_only',
    priority: 'high',
    rationaleTag: 'parsed_abstract_split_focus',
    recheckInSec: 30,
  };
}

function buildSplitDefensiveOrders(
  summary: HeroSummary,
  enemies: UnitState[],
  allies: UnitState[]
): HeroDecision {
  const heroTile = summary.heroState.tile;
  const groupOrders: GroupOrder[] = [];

  const enemyCenter = clusterCenter(enemies.map((enemy) => enemy.tile));
  if (enemyCenter) {
    groupOrders.push({
      group: 'warriors',
      intent: 'advance_to_point',
      moveToTile: midpoint(heroTile, enemyCenter),
    });
  }

  const archerAllies = allies.filter((unit) => unit.role === 'archer');
  const archerCenter = clusterCenter(archerAllies.map((unit) => unit.tile)) ?? heroTile;
  groupOrders.push({
    group: 'archers',
    intent: 'hold_position',
    moveToTile: { ...archerCenter },
  });

  groupOrders.push({
    group: 'hero',
    intent: 'protect_target',
    moveToTile: { ...heroTile },
  });

  return {
    intent: 'hold_position',
    moveToTile: { ...heroTile },
    groupOrders,
    groupOrderMode: 'explicit_only',
    priority: 'medium',
    rationaleTag: 'parsed_abstract_split_defensive',
    recheckInSec: 30,
  };
}

function pickTarget(
  enemies: UnitState[],
  assigned: Set<string>,
  preferredRole: UnitState['role'],
  referenceTile: TileCoord
): UnitState | undefined {
  const available = enemies.filter((enemy) => !assigned.has(enemy.id));
  if (available.length === 0) {
    return undefined;
  }

  const roleMatches = available.filter((enemy) => enemy.role === preferredRole);
  if (roleMatches.length > 0) {
    return roleMatches.sort((a, b) => tileDistance(a.tile, referenceTile) - tileDistance(b.tile, referenceTile))[0];
  }

  return available.sort((a, b) => tileDistance(a.tile, referenceTile) - tileDistance(b.tile, referenceTile))[0];
}

function pickWeakestUnassigned(enemies: UnitState[], assigned: Set<string>): UnitState | undefined {
  const available = enemies.filter((enemy) => !assigned.has(enemy.id));
  if (available.length === 0) {
    return undefined;
  }
  return available.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
}

function midpoint(a: TileCoord, b: TileCoord): TileCoord {
  return {
    col: Math.round((a.col + b.col) / 2),
    row: Math.round((a.row + b.row) / 2),
  };
}

function tileDistance(a: TileCoord, b: TileCoord): number {
  return Math.hypot(a.col - b.col, a.row - b.row);
}

function interpretSingleMessage(
  summary: HeroSummary,
  playerMessage: string,
  terrainDescription?: string
): HeroDecision | null {
  const message = playerMessage.toLowerCase();
  const namedEnemy = resolveNamedUnit(summary.nearbyEnemies, message, summary.heroState.tile);
  const alliedArchers = summary.nearbyAllies.filter((unit) => unit.role === 'archer');
  const archersCenter = alliedArchers.length > 0 ? clusterCenter(alliedArchers.map((unit) => unit.tile)) : undefined;
  const alliesCenter = clusterCenter(summary.nearbyAllies.map((unit) => unit.tile));
  const enemiesCenter = clusterCenter(summary.nearbyEnemies.map((unit) => unit.tile));

  if (containsAny(message, ['retreat', 'fall back', 'regroup', 'pull back', 'withdraw', 'move back'])) {
    const baseAnchor = alliesCenter ?? summary.heroState.tile;
    const namedLocation = resolveNamedLocation(summary, message, 'retreat', terrainDescription, baseAnchor);
    return {
      intent: 'retreat_to_point',
      moveToTile: namedLocation?.tile ?? chooseTacticalAnchor(summary, 'retreat', baseAnchor),
      priority: 'high',
      rationaleTag: namedLocation ? 'parsed_retreat_named_location' : 'parsed_retreat_message',
      recheckInSec: 60,
    };
  }

  if (containsAny(message, ['hold', 'wait', 'stay', 'defend here']) || message.includes('behind')) {
    const baseAnchor = summary.heroState.tile;
    const namedLocation = resolveNamedLocation(summary, message, 'hold', terrainDescription, baseAnchor);
    return {
      intent: 'hold_position',
      moveToTile: namedLocation?.tile ?? chooseTacticalAnchor(summary, 'hold', baseAnchor),
      priority: 'medium',
      rationaleTag: namedLocation ? 'parsed_hold_named_location' : 'parsed_hold_message',
      recheckInSec: 60,
    };
  }

  if (containsAny(message, ['protect', 'guard', 'screen', 'defend'])) {
    const baseAnchor = archersCenter ?? alliesCenter ?? summary.heroState.tile;
    const namedLocation = resolveNamedLocation(summary, message, 'protect', terrainDescription, baseAnchor);
    return {
      intent: 'protect_target',
      moveToTile: namedLocation?.tile ?? chooseTacticalAnchor(summary, 'protect', baseAnchor),
      priority: 'medium',
      rationaleTag: namedLocation
        ? 'parsed_protect_named_location'
        : namedEnemy
          ? 'parsed_protect_named_threat'
          : 'parsed_protect_message',
      recheckInSec: 45,
    };
  }

  if (containsAny(message, ['focus', 'target', 'attack', 'kill'])) {
    if (namedEnemy) {
      return {
        intent: 'focus_enemy',
        targetId: namedEnemy.id,
        moveToTile: { ...namedEnemy.tile },
        priority: 'high',
        rationaleTag: 'parsed_focus_message',
        recheckInSec: 45,
      };
    }

    const closestEnemy = findNearestEnemy(summary);
    if (closestEnemy) {
      return {
        intent: 'focus_enemy',
        targetId: closestEnemy.id,
        moveToTile: { ...closestEnemy.tile },
        priority: 'high',
        rationaleTag: 'parsed_focus_generic',
        recheckInSec: 45,
      };
    }
  }

  if (containsAny(message, ['advance', 'push', 'forward', 'move to', 'go to', 'move'])) {
    const baseAnchor = namedEnemy?.tile ?? enemiesCenter ?? summary.heroState.tile;
    const namedLocation = resolveNamedLocation(summary, message, 'advance', terrainDescription, baseAnchor);
    return {
      intent: 'advance_to_point',
      moveToTile:
        namedLocation?.tile ?? namedEnemy?.tile ?? chooseTacticalAnchor(summary, 'advance', baseAnchor),
      targetId: namedEnemy?.id,
      priority: 'medium',
      rationaleTag: namedLocation
        ? 'parsed_advance_named_location'
        : namedEnemy
          ? 'parsed_advance_named_target'
          : 'parsed_advance_message',
      recheckInSec: 45,
    };
  }

  return null;
}

function extractGroupClauses(playerMessage: string): Array<{ group: UnitGroup; directive: string }> {
  const lowerMessage = playerMessage.toLowerCase();
  const rawSegments = lowerMessage
    .split(/\bwhile\b|;|\bmeanwhile\b/)
    .flatMap((segment) =>
      segment.split(
        /\band\b(?=\s*(?:(?:send|move|position|place|deploy|keep|have|let|tell|make|order)\s+)?(?:(?:only|just)\s+)?(?:our\s+|the\s+|all\s+)?(?:archers?|warriors?|ranged(?:\s+units?)?|hero(?:es)?|commander)\b)/
      )
    )
    .map((segment) => segment.trim())
    .filter(Boolean);

  const clauses: Array<{ group: UnitGroup; directive: string }> = [];
  for (const segment of rawSegments) {
    const groupMatch = segment.match(
      /^(?:(send|move|position|place|deploy|keep|have|let|tell|make|order)\s+)?(?:(?:only|just)\s+)?(?:our\s+|the\s+|all\s+)?(archers?|warriors?|ranged(?:\s+units?)?|hero(?:es)?|commander)\b/
    );
    if (!groupMatch) {
      continue;
    }

    const leadingVerb = normalizeGroupLeadVerb(groupMatch[1]);
    const group = toUnitGroup(groupMatch[2]);
    if (!group) {
      continue;
    }

    const rest = segment
      .replace(
        /^(?:(?:send|move|position|place|deploy|keep|have|let|tell|make|order)\s+)?(?:(?:only|just)\s+)?(?:our\s+|the\s+|all\s+)?(?:archers?|warriors?|ranged(?:\s+units?)?|hero(?:es)?|commander)\b/,
        ''
      )
      .replace(/\band\s+(?:attack|fire|shoot)(?:\s+from\s+there)?\b.*$/, '')
      .replace(/\bfrom there\b/g, '')
      .replace(/\bwhile\b/g, '')
      .trim();

    const directive = `${leadingVerb ? `${leadingVerb} ` : ''}${rest}`.trim();
    if (directive.length === 0) {
      continue;
    }

    clauses.push({ group, directive });
  }

  return clauses;
}

function normalizeGroupLeadVerb(rawVerb: string | undefined): string {
  switch (rawVerb) {
    case 'send':
    case 'move':
    case 'position':
    case 'place':
    case 'deploy':
      return 'move';
    case 'keep':
      return 'hold';
    default:
      return '';
  }
}

function toUnitGroup(token: string): UnitGroup | null {
  if (token.startsWith('archer')) return 'archers';
  if (token.startsWith('ranged')) return 'archers';
  if (token.startsWith('hero') || token === 'commander') return 'hero';
  if (token.startsWith('warrior')) return 'warriors';
  return null;
}

function buildGroupOrder(entry: ParsedGroupDecision): GroupOrder {
  return {
    group: entry.group,
    intent: entry.decision.intent,
    targetId: entry.decision.targetId,
    moveToTile: entry.decision.moveToTile ? { ...entry.decision.moveToTile } : undefined,
  };
}

function selectPrimaryGroupDecision(parsedOrders: ParsedGroupDecision[]): ParsedGroupDecision {
  return [...parsedOrders].sort((a, b) => scoreGroupDecision(b) - scoreGroupDecision(a))[0];
}

function scoreGroupDecision(entry: ParsedGroupDecision): number {
  const intentScore: Record<HeroDecision['intent'], number> = {
    focus_enemy: 5,
    advance_to_point: 4,
    protect_target: 3,
    hold_position: 2,
    retreat_to_point: 1,
    use_skill: 0,
  };

  return intentScore[entry.decision.intent] + (entry.group === 'warriors' ? 0.25 : entry.group === 'hero' ? 0.1 : 0);
}

function highestPriority(priorities: HeroDecision['priority'][]): HeroDecision['priority'] {
  if (priorities.includes('high')) return 'high';
  if (priorities.includes('medium')) return 'medium';
  return 'low';
}

function resolveNamedUnit(
  units: UnitState[],
  message: string,
  referenceTile?: TileCoord
): UnitState | undefined {
  let bestMatch: UnitState | undefined;
  let bestLength = -1;

  for (const unit of units) {
    const names = [unit.displayName, unit.id]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    for (const name of names) {
      if (message.includes(name) && name.length > bestLength) {
        bestLength = name.length;
        bestMatch = unit;
      }
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  const role = hasWord(message, ['archer', 'archers', 'ranged'])
    ? 'archer'
    : hasWord(message, ['warrior', 'warriors', 'melee'])
      ? 'warrior'
      : undefined;
  if (!role) {
    return undefined;
  }

  return findNearestByRole(units, role, referenceTile);
}

function findNearestByRole(
  units: UnitState[],
  role: UnitState['role'],
  referenceTile = { col: 0, row: 0 }
): UnitState | undefined {
  let nearest: UnitState | undefined;
  let nearestDistance = Infinity;

  for (const unit of units) {
    if (unit.role !== role) {
      continue;
    }

    const distance = tileDistance(unit.tile, referenceTile);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = unit;
    }
  }

  return nearest;
}

function resolveNamedLocation(
  summary: HeroSummary,
  message: string,
  intent: TacticalIntent,
  terrainDescription: string | undefined,
  anchor: TileCoord
): NamedLocation | undefined {
  const obstacleAnchor = resolveNamedObstacleAnchor(summary, message, intent, anchor);
  if (obstacleAnchor) {
    return {
      name: obstacleAnchor.obstacle.label,
      tile: obstacleAnchor.tile,
    };
  }

  const directionalAnchor = resolveDirectionalAnchor(summary, message, anchor);
  if (directionalAnchor) {
    return directionalAnchor;
  }

  if (!terrainDescription) {
    return undefined;
  }

  const lines = terrainDescription.split('\n');
  let bestMatch: NamedLocation | undefined;
  let bestLength = -1;

  for (const line of lines) {
    const match = line.match(/-\s+(.+?)\s+at\s+\((\d+)-(\d+),\s+(\d+)-(\d+)\)/i);
    if (!match) {
      continue;
    }

    const [, rawName, x1, x2, y1, y2] = match;
    const name = rawName.trim().toLowerCase();
    if (!message.includes(name) || name.length <= bestLength) {
      continue;
    }

    const x = (Number(x1) + Number(x2)) / 2;
    const y = (Number(y1) + Number(y2)) / 2;
    bestLength = name.length;
    bestMatch = {
      name: rawName.trim(),
      tile: {
        col: Math.max(0, Math.min(summary.grid.cols - 1, Math.floor(x / summary.grid.tileWidth))),
        row: Math.max(0, Math.min(summary.grid.rows - 1, Math.floor(y / summary.grid.tileHeight))),
      },
    };
  }

  return bestMatch;
}

function resolveDirectionalAnchor(
  summary: HeroSummary,
  message: string,
  anchor: TileCoord
): NamedLocation | undefined {
  const clockAnchor = resolveClockAnchor(summary, message, anchor);
  if (clockAnchor) {
    return clockAnchor;
  }

  const north = hasWord(message, ['north', 'top', 'upper', 'up']);
  const south = hasWord(message, ['south', 'bottom', 'lower', 'down']);
  const east = hasWord(message, ['east', 'right']);
  const west = hasWord(message, ['west', 'left']);
  const center = hasWord(message, ['center', 'middle']);

  if (!(north || south || east || west || center)) {
    return undefined;
  }

  let tile = { ...anchor };
  const labels: string[] = [];

  if (north && !south) {
    tile.row = 1;
    labels.push('north');
  } else if (south && !north) {
    tile.row = summary.grid.rows - 2;
    labels.push('south');
  } else if (center) {
    tile.row = Math.floor(summary.grid.rows / 2);
  }

  if (east && !west) {
    tile.col = summary.grid.cols - 2;
    labels.push('east');
  } else if (west && !east) {
    tile.col = 1;
    labels.push('west');
  } else if (center) {
    tile.col = Math.floor(summary.grid.cols / 2);
  }

  if (center && labels.length === 0) {
    labels.push('center');
  }

  return {
    name: `${labels.join(' ')} zone`.trim(),
    tile,
  };
}

function resolveClockAnchor(
  summary: HeroSummary,
  message: string,
  anchor: TileCoord
): NamedLocation | undefined {
  const match = message.match(CLOCK_DIRECTION_REGEX);
  if (!match) {
    return undefined;
  }

  const rawHour = Number(match[1]);
  const rawMinutes = match[2] ? Number(match[2]) : 0;
  const hour = rawHour % 12;
  const angle = ((hour + rawMinutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  const direction = { col: Math.cos(angle), row: Math.sin(angle) };
  const tile = projectTowardPlayableEdge(summary, anchor, direction);
  const label = rawMinutes > 0 ? `${match[1]}:${match[2]} o'clock` : `${match[1]} o'clock`;

  return {
    name: `${label} direction`,
    tile,
  };
}

function projectTowardPlayableEdge(
  summary: HeroSummary,
  anchor: TileCoord,
  direction: { col: number; row: number }
): TileCoord {
  const minCol = 1;
  const maxCol = summary.grid.cols - 2;
  const minRow = 1;
  const maxRow = summary.grid.rows - 2;
  const epsilon = 0.0001;
  const candidates: number[] = [];

  if (Math.abs(direction.col) > epsilon) {
    candidates.push(((direction.col > 0 ? maxCol : minCol) - anchor.col) / direction.col);
  }
  if (Math.abs(direction.row) > epsilon) {
    candidates.push(((direction.row > 0 ? maxRow : minRow) - anchor.row) / direction.row);
  }

  const scale = Math.min(...candidates.filter((value) => value >= 0));
  if (!Number.isFinite(scale)) {
    return {
      col: Math.max(minCol, Math.min(maxCol, anchor.col)),
      row: Math.max(minRow, Math.min(maxRow, anchor.row)),
    };
  }

  return {
    col: Math.max(minCol, Math.min(maxCol, Math.round(anchor.col + direction.col * scale))),
    row: Math.max(minRow, Math.min(maxRow, Math.round(anchor.row + direction.row * scale))),
  };
}

function findNearestEnemy(summary: HeroSummary): UnitState | undefined {
  let nearest: UnitState | undefined;
  let nearestDistance = Infinity;

  for (const enemy of summary.nearbyEnemies) {
    const distance = tileDistance(enemy.tile, summary.heroState.tile);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }

  return nearest;
}

function clusterCenter(tiles: TileCoord[]): TileCoord | undefined {
  if (tiles.length === 0) {
    return undefined;
  }

  let sumCol = 0;
  let sumRow = 0;
  for (const tile of tiles) {
    sumCol += tile.col;
    sumRow += tile.row;
  }

  return {
    col: Math.round(sumCol / tiles.length),
    row: Math.round(sumRow / tiles.length),
  };
}

function containsAny(message: string, terms: string[]): boolean {
  return terms.some((term) => message.includes(term));
}

function hasWord(message: string, terms: string[]): boolean {
  return terms.some((term) => new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(message));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CLOCK_DIRECTION_REGEX =
  /\b(1[0-2]|[1-9])(?::([03]0))?\s*(?:o\s*clock|o'clock|oclock)\b(?:\s+direction)?/i;
