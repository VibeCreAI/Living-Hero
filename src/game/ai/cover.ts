import { BattleObstacle, GroupOrder, HeroDecision, HeroSummary, IntentType, Position } from '../types';

export type TacticalIntent = 'advance' | 'hold' | 'protect' | 'retreat';

export interface CoverAnchor {
  obstacle: BattleObstacle;
  position: Position;
  score: number;
  providesCover: boolean;
}

interface TacticalProfile {
  coverBonus: number;
  exposedPenalty: number;
  anchorWeight: number;
  allyWeight: number;
  desiredThreatDistanceWeight: number;
  retreatDistanceWeight: number;
}

const MAP_WIDTH = 1024;
const MAP_HEIGHT = 768;
const MAP_PADDING = 28;
const COVER_SAMPLE_STEP = 10;
const CORNER_OFFSET = 10;

const PROFILES: Record<TacticalIntent, TacticalProfile> = {
  advance: {
    coverBonus: 44,
    exposedPenalty: 8,
    anchorWeight: 0.16,
    allyWeight: 0.08,
    desiredThreatDistanceWeight: 0.08,
    retreatDistanceWeight: 0,
  },
  hold: {
    coverBonus: 86,
    exposedPenalty: 36,
    anchorWeight: 0.34,
    allyWeight: 0.14,
    desiredThreatDistanceWeight: 0.05,
    retreatDistanceWeight: 0,
  },
  protect: {
    coverBonus: 78,
    exposedPenalty: 32,
    anchorWeight: 0.28,
    allyWeight: 0.18,
    desiredThreatDistanceWeight: 0.05,
    retreatDistanceWeight: 0,
  },
  retreat: {
    coverBonus: 90,
    exposedPenalty: 18,
    anchorWeight: 0.2,
    allyWeight: 0.1,
    desiredThreatDistanceWeight: 0,
    retreatDistanceWeight: 0.08,
  },
};

export function resolveNamedObstacleAnchor(
  summary: HeroSummary,
  message: string,
  intent: TacticalIntent,
  anchor: Position
): CoverAnchor | undefined {
  const lowerMessage = message.toLowerCase();
  let best: CoverAnchor | undefined;
  let bestAliasLength = -1;

  for (const obstacle of summary.obstacles) {
    const matchedAlias = getObstacleAliases(obstacle, summary.obstacles).find((alias) =>
      lowerMessage.includes(alias)
    );
    if (!matchedAlias) {
      continue;
    }

    const candidate = findBestPointAroundObstacle(summary, obstacle, intent, anchor);
    if (
      !best ||
      matchedAlias.length > bestAliasLength ||
      (matchedAlias.length === bestAliasLength && candidate.score > best.score)
    ) {
      best = candidate;
      bestAliasLength = matchedAlias.length;
    }
  }

  return best;
}

export function findBestCoverAnchor(
  summary: HeroSummary,
  intent: TacticalIntent,
  anchor: Position
): CoverAnchor | undefined {
  if (summary.obstacles.length === 0) {
    return undefined;
  }

  let best: CoverAnchor | undefined;
  for (const obstacle of summary.obstacles) {
    const candidate = findBestPointAroundObstacle(summary, obstacle, intent, anchor);
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

export function chooseTacticalAnchor(
  summary: HeroSummary,
  intent: TacticalIntent,
  anchor: Position
): Position {
  const baseAnchor = clampToMap(anchor);
  const bestCover = findBestCoverAnchor(summary, intent, baseAnchor);
  if (!bestCover) {
    return baseAnchor;
  }

  const rawScore = scoreTacticalPosition(summary, baseAnchor, intent, baseAnchor);
  const threshold = intent === 'advance' ? 6 : 10;
  const rawCovered = isPointCovered(summary.obstacles, baseAnchor, getThreatPoint(summary));

  if (
    bestCover.score >= rawScore + threshold ||
    (!rawCovered && bestCover.providesCover && bestCover.score > rawScore - 4)
  ) {
    return { ...bestCover.position };
  }

  return baseAnchor;
}

export function scoreTacticalPosition(
  summary: HeroSummary,
  point: Position,
  intent: TacticalIntent,
  anchor: Position
): number {
  const clampedPoint = clampToMap(point);
  const profile = PROFILES[intent];
  const threat = getThreatPoint(summary);
  const allyCenter = clusterCenter(summary.nearbyAllies) ?? summary.heroState.position;

  if (isInsideObstacle(clampedPoint, summary.obstacles)) {
    return -200;
  }

  let score = 0;
  const covered = isPointCovered(summary.obstacles, clampedPoint, threat);
  score += covered ? profile.coverBonus : -profile.exposedPenalty;

  score -= dist(clampedPoint, anchor) * profile.anchorWeight;
  score -= dist(clampedPoint, allyCenter) * profile.allyWeight;

  if (threat) {
    const threatDistance = dist(clampedPoint, threat);
    if (intent === 'retreat') {
      score += Math.min(threatDistance, 420) * profile.retreatDistanceWeight;
    } else {
      const desiredThreatDistance = getDesiredThreatDistance(summary, intent);
      score -=
        Math.abs(threatDistance - desiredThreatDistance) * profile.desiredThreatDistanceWeight;
    }
  }

  const obstacleDistance = distanceToNearestObstacle(clampedPoint, summary.obstacles);
  score += Math.max(0, 60 - obstacleDistance) * 0.35;

  return score;
}

export function refineDecisionPositionForCover(
  summary: HeroSummary,
  decision: HeroDecision
): HeroDecision {
  const refinedGroupOrders = decision.groupOrders?.map((groupOrder) =>
    refineGroupOrderPositionForCover(summary, groupOrder)
  );

  switch (decision.intent) {
    case 'hold_position':
      return {
        ...decision,
        groupOrders: refinedGroupOrders,
        moveTo: chooseTacticalAnchor(
          summary,
          'hold',
          decision.moveTo ?? summary.heroState.position
        ),
      };

    case 'protect_target':
      return {
        ...decision,
        groupOrders: refinedGroupOrders,
        moveTo: chooseTacticalAnchor(
          summary,
          'protect',
          decision.moveTo ?? clusterCenter(summary.nearbyAllies) ?? summary.heroState.position
        ),
      };

    case 'retreat_to_point':
      return {
        ...decision,
        groupOrders: refinedGroupOrders,
        moveTo: chooseTacticalAnchor(
          summary,
          'retreat',
          decision.moveTo ?? summary.heroState.position
        ),
      };

    case 'advance_to_point':
      if (!decision.moveTo) {
        return decision;
      }
      return {
        ...decision,
        groupOrders: refinedGroupOrders,
        moveTo: chooseTacticalAnchor(summary, 'advance', decision.moveTo),
      };

    default:
      return {
        ...decision,
        groupOrders: refinedGroupOrders,
      };
  }
}

function refineGroupOrderPositionForCover(
  summary: HeroSummary,
  groupOrder: GroupOrder
): GroupOrder {
  const tacticalIntent = toTacticalIntent(groupOrder.intent);
  if (!groupOrder.moveTo || !tacticalIntent) {
    return groupOrder;
  }

  return {
    ...groupOrder,
    moveTo: chooseTacticalAnchor(summary, tacticalIntent, groupOrder.moveTo),
  };
}

export function findBestPointAroundObstacle(
  summary: HeroSummary,
  obstacle: BattleObstacle,
  intent: TacticalIntent,
  anchor: Position
): CoverAnchor {
  const center = getObstacleCenter(obstacle);
  const offset = Math.max(36, Math.min(64, Math.max(obstacle.width, obstacle.height) * 0.5));
  const candidates: Position[] = [
    { x: obstacle.x - offset, y: center.y },
    { x: obstacle.x + obstacle.width + offset, y: center.y },
    { x: center.x, y: obstacle.y - offset },
    { x: center.x, y: obstacle.y + obstacle.height + offset },
    { x: obstacle.x - offset, y: obstacle.y - offset + CORNER_OFFSET },
    { x: obstacle.x - offset, y: obstacle.y + obstacle.height + offset - CORNER_OFFSET },
    { x: obstacle.x + obstacle.width + offset, y: obstacle.y - offset + CORNER_OFFSET },
    {
      x: obstacle.x + obstacle.width + offset,
      y: obstacle.y + obstacle.height + offset - CORNER_OFFSET,
    },
  ].map(clampToMap);

  const threat = getThreatPoint(summary);
  let bestPosition = clampToMap(anchor);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCover = false;

  for (const candidate of dedupePositions(candidates)) {
    let score = scoreTacticalPosition(summary, candidate, intent, anchor);
    const shieldedByObstacle = threat
      ? doesObstacleBlockLine(threat, candidate, obstacle)
      : false;

    score += shieldedByObstacle ? 20 : -12;
    score -= dist(candidate, center) * 0.04;

    if (score > bestScore) {
      bestScore = score;
      bestPosition = candidate;
      bestCover = shieldedByObstacle;
    }
  }

  return {
    obstacle,
    position: bestPosition,
    score: bestScore,
    providesCover: bestCover,
  };
}

function getObstacleAliases(
  obstacle: BattleObstacle,
  allObstacles: BattleObstacle[]
): string[] {
  const aliases = new Set<string>();
  const label = obstacle.label.toLowerCase();
  const idAlias = obstacle.id.toLowerCase().replace(/[-_]+/g, ' ');
  const descriptors = getDirectionalDescriptors(obstacle, allObstacles);

  aliases.add(label);
  aliases.add(idAlias);
  aliases.add(`${label} formation`);

  for (const descriptor of descriptors) {
    aliases.add(`${descriptor} ${label}`);
    aliases.add(`${descriptor} ${idAlias}`);
    aliases.add(`${descriptor} ${label} formation`);
  }

  return Array.from(aliases).sort((a, b) => b.length - a.length);
}

function getDirectionalDescriptors(
  obstacle: BattleObstacle,
  allObstacles: BattleObstacle[]
): string[] {
  if (allObstacles.length <= 1) {
    return [];
  }

  const centers = allObstacles.map(getObstacleCenter);
  const center = getObstacleCenter(obstacle);
  const minX = Math.min(...centers.map((pos) => pos.x));
  const maxX = Math.max(...centers.map((pos) => pos.x));
  const minY = Math.min(...centers.map((pos) => pos.y));
  const maxY = Math.max(...centers.map((pos) => pos.y));
  const xRange = Math.max(1, maxX - minX);
  const yRange = Math.max(1, maxY - minY);
  const xNorm = (center.x - minX) / xRange;
  const yNorm = (center.y - minY) / yRange;

  const horizontal =
    xNorm < 0.34
      ? ['west', 'western', 'left']
      : xNorm > 0.66
        ? ['east', 'eastern', 'right']
        : ['center', 'middle'];

  const vertical =
    yNorm < 0.34
      ? ['north', 'northern', 'top', 'upper']
      : yNorm > 0.66
        ? ['south', 'southern', 'bottom', 'lower']
        : ['center', 'middle'];

  const descriptors = new Set<string>([...horizontal, ...vertical]);
  for (const h of horizontal) {
    for (const v of vertical) {
      descriptors.add(`${v} ${h}`);
      descriptors.add(`${h} ${v}`);
    }
  }

  return Array.from(descriptors);
}

function getDesiredThreatDistance(summary: HeroSummary, intent: TacticalIntent): number {
  const avgAllyRange =
    summary.nearbyAllies.length > 0
      ? summary.nearbyAllies.reduce((sum, ally) => sum + ally.attackRange, 0) /
        summary.nearbyAllies.length
      : 90;

  switch (intent) {
    case 'advance':
      return Math.max(110, avgAllyRange * 0.9);
    case 'protect':
      return avgAllyRange + 70;
    case 'hold':
      return avgAllyRange + 110;
    case 'retreat':
      return avgAllyRange + 160;
  }
}

function toTacticalIntent(intent: IntentType): TacticalIntent | null {
  switch (intent) {
    case 'advance_to_point':
      return 'advance';
    case 'hold_position':
      return 'hold';
    case 'protect_target':
      return 'protect';
    case 'retreat_to_point':
      return 'retreat';
    default:
      return null;
  }
}

function getThreatPoint(summary: HeroSummary): Position | undefined {
  return clusterCenter(summary.nearbyEnemies);
}

function clusterCenter(units: { position: Position }[]): Position | undefined {
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

function getObstacleCenter(obstacle: BattleObstacle): Position {
  return {
    x: obstacle.x + obstacle.width / 2,
    y: obstacle.y + obstacle.height / 2,
  };
}

function dedupePositions(points: Position[]): Position[] {
  const seen = new Set<string>();
  const unique: Position[] = [];

  for (const point of points) {
    const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(point);
  }

  return unique;
}

function clampToMap(point: Position): Position {
  return {
    x: Math.min(MAP_WIDTH - MAP_PADDING, Math.max(MAP_PADDING, point.x)),
    y: Math.min(MAP_HEIGHT - MAP_PADDING, Math.max(MAP_PADDING, point.y)),
  };
}

function dist(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isInsideObstacle(point: Position, obstacles: BattleObstacle[]): boolean {
  return obstacles.some(
    (obstacle) =>
      point.x >= obstacle.x &&
      point.x <= obstacle.x + obstacle.width &&
      point.y >= obstacle.y &&
      point.y <= obstacle.y + obstacle.height
  );
}

function distanceToNearestObstacle(point: Position, obstacles: BattleObstacle[]): number {
  if (obstacles.length === 0) {
    return Infinity;
  }

  let nearest = Infinity;
  for (const obstacle of obstacles) {
    const dx = Math.max(obstacle.x - point.x, 0, point.x - (obstacle.x + obstacle.width));
    const dy = Math.max(obstacle.y - point.y, 0, point.y - (obstacle.y + obstacle.height));
    nearest = Math.min(nearest, Math.hypot(dx, dy));
  }

  return nearest;
}

function isPointCovered(
  obstacles: BattleObstacle[],
  point: Position,
  threat: Position | undefined
): boolean {
  if (!threat) {
    return false;
  }

  return obstacles.some((obstacle) => doesObstacleBlockLine(threat, point, obstacle));
}

function doesObstacleBlockLine(
  from: Position,
  to: Position,
  obstacle: BattleObstacle
): boolean {
  const distance = dist(from, to);
  const steps = Math.max(1, Math.ceil(distance / COVER_SAMPLE_STEP));
  const left = obstacle.x - 4;
  const right = obstacle.x + obstacle.width + 4;
  const top = obstacle.y - 4;
  const bottom = obstacle.y + obstacle.height + 4;

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sampleX = from.x + (to.x - from.x) * t;
    const sampleY = from.y + (to.y - from.y) * t;
    if (sampleX >= left && sampleX <= right && sampleY >= top && sampleY <= bottom) {
      return true;
    }
  }

  return false;
}
