import { GroupOrder, HeroDecision, HeroSummary, Position, UnitGroup, UnitState } from '../types';
import { chooseTacticalAnchor, resolveNamedObstacleAnchor, TacticalIntent } from './cover';

interface NamedLocation {
  name: string;
  position: Position;
}

interface ParsedGroupDecision {
  group: UnitGroup;
  decision: HeroDecision;
}

const MAP_WIDTH = 1024;
const MAP_HEIGHT = 768;
const MAP_EDGE_PADDING = 96;
const MAP_CENTER = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

export function interpretPlayerMessage(
  summary: HeroSummary,
  playerMessage: string,
  terrainDescription?: string
): HeroDecision | null {
  return (
    interpretGroupedMessage(summary, playerMessage, terrainDescription) ??
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
      parsedOrders.push({
        group: clause.group,
        decision: parsed,
      });
    }
  }

  if (parsedOrders.length === 0) {
    return null;
  }

  const primary = selectPrimaryGroupDecision(parsedOrders);
  const priorities = parsedOrders.map((entry) => entry.decision.priority);
  const recheckInSec = Math.min(...parsedOrders.map((entry) => entry.decision.recheckInSec));

  return {
    intent: primary.decision.intent,
    targetId: primary.decision.targetId,
    moveTo: primary.decision.moveTo ? { ...primary.decision.moveTo } : undefined,
    groupOrders: parsedOrders.map((entry) => buildGroupOrder(entry)),
    priority: highestPriority(priorities),
    rationaleTag: 'parsed_group_orders',
    recheckInSec,
  };
}

function interpretSingleMessage(
  summary: HeroSummary,
  playerMessage: string,
  terrainDescription?: string
): HeroDecision | null {
  const message = playerMessage.toLowerCase();
  const namedEnemy = resolveNamedUnit(summary.nearbyEnemies, message, summary.heroState.position);
  const alliedArchers = summary.nearbyAllies.filter((unit) => unit.role === 'archer');
  const archersCenter = alliedArchers.length > 0 ? clusterCenter(alliedArchers) : undefined;
  const alliesCenter = clusterCenter(summary.nearbyAllies);
  const enemiesCenter = clusterCenter(summary.nearbyEnemies);

  if (
    containsAny(message, ['retreat', 'fall back', 'regroup', 'pull back', 'withdraw', 'move back'])
  ) {
    const baseAnchor = alliesCenter ?? summary.heroState.position;
    const namedLocation = resolveNamedLocation(
      summary,
      message,
      'retreat',
      terrainDescription,
      baseAnchor
    );

    return {
      intent: 'retreat_to_point',
      moveTo: namedLocation?.position ?? chooseTacticalAnchor(summary, 'retreat', baseAnchor),
      priority: 'high',
      rationaleTag: namedLocation ? 'parsed_retreat_named_location' : 'parsed_retreat_message',
      recheckInSec: 60,
    };
  }

  if (
    containsAny(message, ['hold', 'wait', 'stay', 'defend here']) ||
    message.includes('behind')
  ) {
    const baseAnchor = summary.heroState.position;
    const namedLocation = resolveNamedLocation(
      summary,
      message,
      'hold',
      terrainDescription,
      baseAnchor
    );

    return {
      intent: 'hold_position',
      moveTo: namedLocation?.position ?? chooseTacticalAnchor(summary, 'hold', baseAnchor),
      priority: 'medium',
      rationaleTag: namedLocation ? 'parsed_hold_named_location' : 'parsed_hold_message',
      recheckInSec: 60,
    };
  }

  if (containsAny(message, ['protect', 'guard', 'screen', 'defend'])) {
    const baseAnchor = archersCenter ?? alliesCenter ?? summary.heroState.position;
    const namedLocation = resolveNamedLocation(
      summary,
      message,
      'protect',
      terrainDescription,
      baseAnchor
    );

    return {
      intent: 'protect_target',
      moveTo: namedLocation?.position ?? chooseTacticalAnchor(summary, 'protect', baseAnchor),
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
        moveTo: { ...namedEnemy.position },
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
        moveTo: { ...closestEnemy.position },
        priority: 'high',
        rationaleTag: 'parsed_focus_generic',
        recheckInSec: 45,
      };
    }
  }

  if (containsAny(message, ['advance', 'push', 'forward', 'move to', 'go to', 'move'])) {
    const baseAnchor = namedEnemy?.position ?? enemiesCenter ?? summary.heroState.position;
    const namedLocation = resolveNamedLocation(
      summary,
      message,
      'advance',
      terrainDescription,
      baseAnchor
    );

    return {
      intent: 'advance_to_point',
      moveTo:
        namedLocation?.position ??
        namedEnemy?.position ??
        chooseTacticalAnchor(summary, 'advance', baseAnchor),
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
        /\band\b(?=\s*(?:(?:send|move|position|place|deploy|keep|have|let|tell|make|order)\s+)?(?:our\s+|the\s+|all\s+)?(?:archers?|warriors?)\b)/
      )
    )
    .map((segment) => segment.trim())
    .filter(Boolean);

  const clauses: Array<{ group: UnitGroup; directive: string }> = [];
  for (const segment of rawSegments) {
    const groupMatch = segment.match(
      /^(?:(send|move|position|place|deploy|keep|have|let|tell|make|order)\s+)?(?:our\s+|the\s+|all\s+)?(archers?|warriors?)\b/
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
        /^(?:(?:send|move|position|place|deploy|keep|have|let|tell|make|order)\s+)?(?:our\s+|the\s+|all\s+)?(?:archers?|warriors?)\b/,
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
  if (token.startsWith('archer')) {
    return 'archers';
  }

  if (token.startsWith('warrior')) {
    return 'warriors';
  }

  return null;
}

function buildGroupOrder(entry: ParsedGroupDecision): GroupOrder {
  return {
    group: entry.group,
    intent: entry.decision.intent,
    targetId: entry.decision.targetId,
    moveTo: entry.decision.moveTo ? { ...entry.decision.moveTo } : undefined,
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

  return intentScore[entry.decision.intent] + (entry.group === 'warriors' ? 0.25 : 0);
}

function highestPriority(
  priorities: HeroDecision['priority'][]
): HeroDecision['priority'] {
  if (priorities.includes('high')) {
    return 'high';
  }

  if (priorities.includes('medium')) {
    return 'medium';
  }

  return 'low';
}

function resolveNamedUnit(
  units: UnitState[],
  message: string,
  referencePoint?: Position
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

  const role =
    message.includes('archer') ? 'archer' : message.includes('warrior') ? 'warrior' : undefined;
  if (!role) {
    return undefined;
  }

  return findNearestByRole(units, role, referencePoint);
}

function findNearestByRole(
  units: UnitState[],
  role: UnitState['role'],
  referencePoint = { x: 512, y: 384 }
): UnitState | undefined {
  let nearest: UnitState | undefined;
  let nearestDistance = Infinity;

  for (const unit of units) {
    if (unit.role !== role) {
      continue;
    }

    const distance = Math.hypot(unit.position.x - referencePoint.x, unit.position.y - referencePoint.y);
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
  anchor: Position
): NamedLocation | undefined {
  const obstacleAnchor = resolveNamedObstacleAnchor(summary, message, intent, anchor);
  if (obstacleAnchor) {
    return {
      name: obstacleAnchor.obstacle.label,
      position: obstacleAnchor.position,
    };
  }

  const directionalAnchor = resolveDirectionalAnchor(message, anchor);
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

    bestLength = name.length;
    bestMatch = {
      name: rawName.trim(),
      position: {
        x: (Number(x1) + Number(x2)) / 2,
        y: (Number(y1) + Number(y2)) / 2,
      },
    };
  }

  return bestMatch;
}

function resolveDirectionalAnchor(
  message: string,
  anchor: Position
): NamedLocation | undefined {
  const clockAnchor = resolveClockAnchor(message, anchor);
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

  let x = anchor.x;
  let y = anchor.y;
  const labels: string[] = [];

  if (north && !south) {
    y = MAP_EDGE_PADDING;
    labels.push('north');
  } else if (south && !north) {
    y = MAP_HEIGHT - MAP_EDGE_PADDING;
    labels.push('south');
  } else if (center) {
    y = MAP_CENTER.y;
  }

  if (east && !west) {
    x = MAP_WIDTH - MAP_EDGE_PADDING;
    labels.push('east');
  } else if (west && !east) {
    x = MAP_EDGE_PADDING;
    labels.push('west');
  } else if (center) {
    x = MAP_CENTER.x;
  }

  if (center && labels.length === 0) {
    labels.push('center');
  }

  return {
    name: `${labels.join(' ')} zone`.trim(),
    position: { x, y },
  };
}

function resolveClockAnchor(
  message: string,
  anchor: Position
): NamedLocation | undefined {
  const match = message.match(CLOCK_DIRECTION_REGEX);
  if (!match) {
    return undefined;
  }

  const rawHour = Number(match[1]);
  const rawMinutes = match[2] ? Number(match[2]) : 0;
  const hour = rawHour % 12;
  const angle = ((hour + rawMinutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const position = projectTowardPlayableEdge(anchor, direction);
  const label = rawMinutes > 0 ? `${match[1]}:${match[2]} o'clock` : `${match[1]} o'clock`;

  return {
    name: `${label} direction`,
    position,
  };
}

function projectTowardPlayableEdge(
  anchor: Position,
  direction: Position
): Position {
  const minX = MAP_EDGE_PADDING;
  const maxX = MAP_WIDTH - MAP_EDGE_PADDING;
  const minY = MAP_EDGE_PADDING;
  const maxY = MAP_HEIGHT - MAP_EDGE_PADDING;
  const epsilon = 0.0001;
  const candidates: number[] = [];

  if (Math.abs(direction.x) > epsilon) {
    candidates.push(((direction.x > 0 ? maxX : minX) - anchor.x) / direction.x);
  }

  if (Math.abs(direction.y) > epsilon) {
    candidates.push(((direction.y > 0 ? maxY : minY) - anchor.y) / direction.y);
  }

  const scale = Math.min(...candidates.filter((value) => value >= 0));
  if (!Number.isFinite(scale)) {
    return {
      x: clamp(anchor.x, minX, maxX),
      y: clamp(anchor.y, minY, maxY),
    };
  }

  return {
    x: clamp(anchor.x + direction.x * scale, minX, maxX),
    y: clamp(anchor.y + direction.y * scale, minY, maxY),
  };
}

function findNearestEnemy(summary: HeroSummary): UnitState | undefined {
  let nearest: UnitState | undefined;
  let nearestDistance = Infinity;

  for (const enemy of summary.nearbyEnemies) {
    const distance = Math.hypot(
      enemy.position.x - summary.heroState.position.x,
      enemy.position.y - summary.heroState.position.y
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }

  return nearest;
}

function clusterCenter(units: UnitState[]): Position | undefined {
  if (units.length === 0) {
    return undefined;
  }

  let sumX = 0;
  let sumY = 0;
  for (const unit of units) {
    sumX += unit.position.x;
    sumY += unit.position.y;
  }

  return {
    x: sumX / units.length,
    y: sumY / units.length,
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const CLOCK_DIRECTION_REGEX =
  /\b(1[0-2]|[1-9])(?::([03]0))?\s*(?:o\s*clock|o'clock|oclock)\b(?:\s+direction)?/i;
