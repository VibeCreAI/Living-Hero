import {
  BattleObstacle,
  GroupOrder,
  HeroDecision,
  HeroSummary,
  IntentType,
  Position,
  TileCoord,
} from '../types';
import { tileToWorld } from './BattleVocabulary';

export type TacticalIntent = 'advance' | 'hold' | 'protect' | 'retreat';

export interface CoverAnchor {
  obstacle: BattleObstacle;
  tile: TileCoord;
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

const MAP_PADDING_TILES = 1;
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
  anchorTile: TileCoord
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

    const candidate = findBestPointAroundObstacle(summary, obstacle, intent, anchorTile);
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
  anchorTile: TileCoord
): CoverAnchor | undefined {
  if (summary.obstacles.length === 0) {
    return undefined;
  }

  let best: CoverAnchor | undefined;
  for (const obstacle of summary.obstacles) {
    const candidate = findBestPointAroundObstacle(summary, obstacle, intent, anchorTile);
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

export function chooseTacticalAnchor(
  summary: HeroSummary,
  intent: TacticalIntent,
  anchorTile: TileCoord
): TileCoord {
  const baseAnchor = clampToGrid(anchorTile, summary);
  const bestCover = findBestCoverAnchor(summary, intent, baseAnchor);
  if (!bestCover) {
    return baseAnchor;
  }

  const rawScore = scoreTacticalPosition(summary, baseAnchor, intent, baseAnchor);
  const threshold = intent === 'advance' ? 6 : 10;
  const rawCovered = isPointCovered(
    summary.obstacles,
    tileToWorld(baseAnchor, summary.grid),
    getThreatPoint(summary)
  );

  if (
    bestCover.score >= rawScore + threshold ||
    (!rawCovered && bestCover.providesCover && bestCover.score > rawScore - 4)
  ) {
    return { ...bestCover.tile };
  }

  return baseAnchor;
}

export function scoreTacticalPosition(
  summary: HeroSummary,
  tile: TileCoord,
  intent: TacticalIntent,
  anchorTile: TileCoord
): number {
  const clampedTile = clampToGrid(tile, summary);
  const point = tileToWorld(clampedTile, summary.grid);
  const anchor = tileToWorld(anchorTile, summary.grid);
  const profile = PROFILES[intent];
  const threat = getThreatPoint(summary);
  const allyCenter = clusterCenter(summary.nearbyAllies.map((ally) => ally.position)) ?? summary.heroState.position;

  if (isInsideObstacle(point, summary.obstacles)) {
    return -200;
  }

  let score = 0;
  const covered = isPointCovered(summary.obstacles, point, threat);
  score += covered ? profile.coverBonus : -profile.exposedPenalty;

  score -= dist(point, anchor) * profile.anchorWeight;
  score -= dist(point, allyCenter) * profile.allyWeight;

  if (threat) {
    const threatDistance = dist(point, threat);
    if (intent === 'retreat') {
      score += Math.min(threatDistance, 420) * profile.retreatDistanceWeight;
    } else {
      const desiredThreatDistance = getDesiredThreatDistance(summary, intent);
      score -= Math.abs(threatDistance - desiredThreatDistance) * profile.desiredThreatDistanceWeight;
    }
  }

  const obstacleDistance = distanceToNearestObstacle(point, summary.obstacles);
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
        moveToTile: chooseTacticalAnchor(
          summary,
          'hold',
          decision.moveToTile ?? summary.heroState.tile
        ),
      };

    case 'protect_target':
      return {
        ...decision,
        groupOrders: refinedGroupOrders,
        moveToTile: chooseTacticalAnchor(
          summary,
          'protect',
          decision.moveToTile ??
            clusterCenterToTile(summary, summary.nearbyAllies.map((ally) => ally.position)) ??
            summary.heroState.tile
        ),
      };

    case 'retreat_to_point':
      return {
        ...decision,
        groupOrders: refinedGroupOrders,
        moveToTile: chooseTacticalAnchor(
          summary,
          'retreat',
          decision.moveToTile ?? summary.heroState.tile
        ),
      };

    case 'advance_to_point':
      if (!decision.moveToTile) {
        return decision;
      }
      return {
        ...decision,
        groupOrders: refinedGroupOrders,
        moveToTile: chooseTacticalAnchor(summary, 'advance', decision.moveToTile),
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
  if (!groupOrder.moveToTile || !tacticalIntent) {
    return groupOrder;
  }

  return {
    ...groupOrder,
    moveToTile: chooseTacticalAnchor(summary, tacticalIntent, groupOrder.moveToTile),
  };
}

export function findBestPointAroundObstacle(
  summary: HeroSummary,
  obstacle: BattleObstacle,
  intent: TacticalIntent,
  anchorTile: TileCoord
): CoverAnchor {
  const center = getObstacleCenter(obstacle);
  const offset = Math.max(36, Math.min(64, Math.max(obstacle.width, obstacle.height) * 0.5));
  const candidatePoints: Position[] = [
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
  ];

  const threat = getThreatPoint(summary);
  let bestTile = clampToGrid(anchorTile, summary);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCover = false;

  for (const candidateTile of dedupeTiles(
    candidatePoints.map((point) =>
      clampToGrid(
        worldToNearestTile(summary, point),
        summary
      )
    )
  )) {
    const candidate = tileToWorld(candidateTile, summary.grid);
    let score = scoreTacticalPosition(summary, candidateTile, intent, anchorTile);
    const shieldedByObstacle = threat ? doesObstacleBlockLine(threat, candidate, obstacle) : false;

    score += shieldedByObstacle ? 20 : -12;
    score -= dist(candidate, center) * 0.04;

    if (score > bestScore) {
      bestScore = score;
      bestTile = candidateTile;
      bestCover = shieldedByObstacle;
    }
  }

  return {
    obstacle,
    tile: bestTile,
    position: tileToWorld(bestTile, summary.grid),
    score: bestScore,
    providesCover: bestCover,
  };
}

function getObstacleAliases(obstacle: BattleObstacle, allObstacles: BattleObstacle[]): string[] {
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
  return clusterCenter(summary.nearbyEnemies.map((enemy) => enemy.position));
}

function clusterCenter(points: Position[]): Position | undefined {
  if (points.length === 0) {
    return undefined;
  }

  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
  }

  return {
    x: sumX / points.length,
    y: sumY / points.length,
  };
}

function clusterCenterToTile(summary: HeroSummary, points: Position[]): TileCoord | undefined {
  const center = clusterCenter(points);
  return center ? worldToNearestTile(summary, center) : undefined;
}

function getObstacleCenter(obstacle: BattleObstacle): Position {
  return {
    x: obstacle.x + obstacle.width / 2,
    y: obstacle.y + obstacle.height / 2,
  };
}

function dedupeTiles(tiles: TileCoord[]): TileCoord[] {
  const unique = new Map<string, TileCoord>();
  for (const tile of tiles) {
    unique.set(`${tile.col}:${tile.row}`, tile);
  }
  return [...unique.values()];
}

function worldToNearestTile(summary: HeroSummary, point: Position): TileCoord {
  const tile = {
    col: Math.floor(point.x / summary.grid.tileWidth),
    row: Math.floor(point.y / summary.grid.tileHeight),
  };
  return clampToGrid(tile, summary);
}

function clampToGrid(tile: TileCoord, summary: HeroSummary): TileCoord {
  return {
    col: Math.min(summary.grid.cols - MAP_PADDING_TILES, Math.max(MAP_PADDING_TILES, Math.round(tile.col))),
    row: Math.min(summary.grid.rows - MAP_PADDING_TILES, Math.max(MAP_PADDING_TILES, Math.round(tile.row))),
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
