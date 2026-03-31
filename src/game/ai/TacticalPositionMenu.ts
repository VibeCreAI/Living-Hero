import { HeroSummary, Position, TileCoord } from '../types';
import {
  findBestPointAroundObstacle,
  scoreTacticalPosition,
  TacticalIntent,
} from './cover';
import { obstacleDirectionLabel, tileToRegion, tileToWorld } from './BattleVocabulary';

export interface TacticalPosition {
  label: string;
  name: string;
  tile: TileCoord;
  coords: Position;
  description: string;
  coverQuality: 'full' | 'partial' | 'exposed';
  obstacleName?: string;
}

export interface TacticalPositionMenuResult {
  positions: TacticalPosition[];
  lookup: Map<string, TacticalPosition>;
}

const LABELS = 'ABCDEFGH';
const MAX_POSITIONS = 8;

export function buildTacticalPositionMenu(
  summary: HeroSummary,
  intent: TacticalIntent = 'hold'
): TacticalPositionMenuResult {
  const candidates: Omit<TacticalPosition, 'label'>[] = [];
  const anchor = summary.heroState.tile;
  const threat = clusterCenter(summary.nearbyEnemies.map((enemy) => enemy.position));

  for (const obstacle of summary.obstacles) {
    const coverAnchor = findBestPointAroundObstacle(summary, obstacle, intent, anchor);
    const region = tileToRegion(coverAnchor.tile, summary.grid);
    const dirLabel = obstacleDirectionLabel(obstacle, summary.grid);

    candidates.push({
      name: `Behind ${dirLabel}`,
      tile: coverAnchor.tile,
      coords: coverAnchor.position,
      description: buildCoverDescription(
        coverAnchor.providesCover,
        region,
        threat,
        coverAnchor.position
      ),
      coverQuality: coverAnchor.providesCover ? 'full' : 'partial',
      obstacleName: obstacle.label,
    });
  }

  for (const anchorOption of summary.grid.tacticalAnchors) {
    if (isNearExisting(anchorOption.tile, candidates.map((candidate) => candidate.tile), 1)) {
      continue;
    }

    const coords = tileToWorld(anchorOption.tile, summary.grid);
    const isExposed = !threat || !isShielded(coords, threat, summary.obstacles);
    candidates.push({
      name: anchorOption.name,
      tile: anchorOption.tile,
      coords,
      description: isExposed
        ? `exposed, ${describeThreatRelation(coords, threat)}`
        : `some cover, ${describeThreatRelation(coords, threat)}`,
      coverQuality: isExposed ? 'exposed' : 'partial',
    });
  }

  if (!isNearExisting(anchor, candidates.map((candidate) => candidate.tile), 1)) {
    candidates.push({
      name: 'Current Position',
      tile: { ...anchor },
      coords: tileToWorld(anchor, summary.grid),
      description: `where you are now (${tileToRegion(anchor, summary.grid)})`,
      coverQuality: 'exposed',
    });
  }

  const scored = candidates.map((candidate) => ({
    ...candidate,
    score: scoreTacticalPosition(summary, candidate.tile, intent, anchor),
  }));
  scored.sort((a, b) => b.score - a.score);

  const deduped: typeof scored = [];
  for (const scoredCandidate of scored) {
    if (!isNearExisting(scoredCandidate.tile, deduped.map((entry) => entry.tile), 1)) {
      deduped.push(scoredCandidate);
    }
  }

  const positions: TacticalPosition[] = deduped
    .slice(0, MAX_POSITIONS)
    .map((candidate, index) => ({
      label: LABELS[index] ?? String(index),
      name: candidate.name,
      tile: { ...candidate.tile },
      coords: { ...candidate.coords },
      description: candidate.description,
      coverQuality: candidate.coverQuality,
      obstacleName: candidate.obstacleName,
    }));

  const lookup = new Map<string, TacticalPosition>();
  for (const position of positions) {
    lookup.set(position.label.toLowerCase(), position);
    lookup.set(position.name.toLowerCase(), position);
  }

  return { positions, lookup };
}

export function resolveMoveOption(
  menu: TacticalPositionMenuResult,
  moveOption: string
): TileCoord | undefined {
  if (!moveOption) {
    return undefined;
  }

  const lower = moveOption.toLowerCase().trim();
  const byLabel = menu.lookup.get(lower);
  if (byLabel) {
    return { ...byLabel.tile };
  }

  for (const position of menu.positions) {
    if (
      position.name.toLowerCase().includes(lower) ||
      lower.includes(position.label.toLowerCase())
    ) {
      return { ...position.tile };
    }
  }

  return undefined;
}

export function formatPositionMenuForPrompt(menu: TacticalPositionMenuResult): string {
  if (menu.positions.length === 0) {
    return 'TACTICAL TILES: Open field, no significant tactical tiles.';
  }

  const lines = menu.positions.map(
    (position) =>
      `  ${position.label}: ${position.name} [${position.tile.col},${position.tile.row}] - ${position.coverQuality} cover, ${position.description}`
  );

  return `TACTICAL TILES (pick a letter for moveOption):\n${lines.join('\n')}`;
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
  return { x: sumX / points.length, y: sumY / points.length };
}

function isNearExisting(tile: TileCoord, existing: TileCoord[], radius: number): boolean {
  return existing.some(
    (entry) => Math.hypot(tile.col - entry.col, tile.row - entry.row) <= radius
  );
}

function isShielded(point: Position, threat: Position, obstacles: HeroSummary['obstacles']): boolean {
  return obstacles.some((obstacle) => {
    const distance = Math.hypot(threat.x - point.x, threat.y - point.y);
    const steps = Math.max(1, Math.ceil(distance / 10));
    for (let index = 1; index < steps; index++) {
      const t = index / steps;
      const sx = threat.x + (point.x - threat.x) * t;
      const sy = threat.y + (point.y - threat.y) * t;
      if (
        sx >= obstacle.x - 4 &&
        sx <= obstacle.x + obstacle.width + 4 &&
        sy >= obstacle.y - 4 &&
        sy <= obstacle.y + obstacle.height + 4
      ) {
        return true;
      }
    }
    return false;
  });
}

function buildCoverDescription(
  providesCover: boolean,
  _region: string,
  threat: Position | undefined,
  position: Position
): string {
  const cover = providesCover ? 'shielded from enemies' : 'partial cover';
  const threatRelation = threat ? describeThreatRelation(position, threat) : 'no enemies visible';
  return `${cover}, ${threatRelation}`;
}

function describeThreatRelation(position: Position, threat: Position | undefined): string {
  if (!threat) {
    return 'no enemies nearby';
  }

  const distance = Math.hypot(position.x - threat.x, position.y - threat.y);
  if (distance < 150) {
    return 'close to enemies';
  }
  if (distance < 300) {
    return 'mid-range from enemies';
  }
  return 'far from enemies';
}
