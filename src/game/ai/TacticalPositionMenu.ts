import { BattleObstacle, HeroSummary, Position } from '../types';
import {
  findBestPointAroundObstacle,
  scoreTacticalPosition,
  TacticalIntent,
} from './cover';
import { positionToRegion, obstacleDirectionLabel } from './BattleVocabulary';

/**
 * A pre-computed tactical position that the LLM can pick by label letter.
 * The LLM sees the label + description; the resolver maps the letter back to coords.
 */
export interface TacticalPosition {
  /** Single letter: A, B, C, ... */
  label: string;
  /** Human-readable name: "Behind North Wall" */
  name: string;
  /** Actual map coordinates for display + execution */
  coords: Position;
  /** One-line tactical description for the prompt */
  description: string;
  /** Whether this position is shielded from the threat */
  coverQuality: 'full' | 'partial' | 'exposed';
  /** Source obstacle (if position is obstacle-derived) */
  obstacleName?: string;
}

export interface TacticalPositionMenuResult {
  positions: TacticalPosition[];
  /** Map from label letter → TacticalPosition for fast lookup */
  lookup: Map<string, TacticalPosition>;
}

const LABELS = 'ABCDEFGH';
const DEDUP_RADIUS = 60;
const MAX_POSITIONS = 8;
const MAP_WIDTH = 1024;
const MAP_HEIGHT = 768;

/**
 * Generate a menu of tactical positions for the LLM to pick from.
 * Combines obstacle-derived cover positions + open-field cardinal positions + hero's current position.
 */
export function buildTacticalPositionMenu(
  summary: HeroSummary,
  intent: TacticalIntent = 'hold'
): TacticalPositionMenuResult {
  const candidates: Omit<TacticalPosition, 'label'>[] = [];
  const anchor = summary.heroState.position;
  const threat = clusterCenter(summary.nearbyEnemies);

  // 1. Generate obstacle-derived positions
  for (const obstacle of summary.obstacles) {
    const coverAnchor = findBestPointAroundObstacle(summary, obstacle, intent, anchor);
    const region = positionToRegion(coverAnchor.position);
    const dirLabel = obstacleDirectionLabel(obstacle);

    candidates.push({
      name: `Behind ${dirLabel}`,
      coords: coverAnchor.position,
      description: buildCoverDescription(coverAnchor.providesCover, region, threat, coverAnchor.position),
      coverQuality: coverAnchor.providesCover ? 'full' : 'partial',
      obstacleName: obstacle.label,
    });
  }

  // 2. Add open-field cardinal positions
  const cardinalPositions: { name: string; pos: Position }[] = [
    { name: 'Center Field', pos: { x: MAP_WIDTH * 0.5, y: MAP_HEIGHT * 0.5 } },
    { name: 'East Flank', pos: { x: MAP_WIDTH * 0.82, y: MAP_HEIGHT * 0.5 } },
    { name: 'West Flank', pos: { x: MAP_WIDTH * 0.18, y: MAP_HEIGHT * 0.5 } },
    { name: 'North Field', pos: { x: MAP_WIDTH * 0.5, y: MAP_HEIGHT * 0.2 } },
    { name: 'South Field', pos: { x: MAP_WIDTH * 0.5, y: MAP_HEIGHT * 0.8 } },
  ];

  for (const { name, pos } of cardinalPositions) {
    // Only add if not too close to an existing obstacle-derived position
    if (!isNearExisting(pos, candidates.map((c) => c.coords), DEDUP_RADIUS)) {
      const isExposed = !threat || !isShielded(pos, threat, summary.obstacles);
      candidates.push({
        name,
        coords: pos,
        description: isExposed
          ? `exposed, ${describeThreatRelation(pos, threat)}`
          : `some cover, ${describeThreatRelation(pos, threat)}`,
        coverQuality: isExposed ? 'exposed' : 'partial',
      });
    }
  }

  // 3. Add hero's current position
  if (!isNearExisting(anchor, candidates.map((c) => c.coords), 40)) {
    const region = positionToRegion(anchor);
    candidates.push({
      name: 'Current Position',
      coords: { ...anchor },
      description: `where you are now (${region})`,
      coverQuality: 'exposed',
    });
  }

  // 4. Score and rank all positions, take top N
  const scored = candidates.map((c) => ({
    ...c,
    score: scoreTacticalPosition(summary, c.coords, intent, anchor),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate close positions (keep higher-scored)
  const deduped: typeof scored = [];
  for (const s of scored) {
    if (!isNearExisting(s.coords, deduped.map((d) => d.coords), DEDUP_RADIUS)) {
      deduped.push(s);
    }
  }

  // 5. Assign labels and build result
  const positions: TacticalPosition[] = deduped
    .slice(0, MAX_POSITIONS)
    .map((s, i) => ({
      label: LABELS[i] ?? String(i),
      name: s.name,
      coords: { x: Math.round(s.coords.x), y: Math.round(s.coords.y) },
      description: s.description,
      coverQuality: s.coverQuality,
      obstacleName: s.obstacleName,
    }));

  const lookup = new Map<string, TacticalPosition>();
  for (const pos of positions) {
    lookup.set(pos.label.toLowerCase(), pos);
    // Also allow matching by name prefix
    lookup.set(pos.name.toLowerCase(), pos);
  }

  return { positions, lookup };
}

/**
 * Resolve an LLM moveOption string to coordinates.
 * Accepts: label letter ("A"), position name ("Behind North Wall"), or region ("east").
 */
export function resolveMoveOption(
  menu: TacticalPositionMenuResult,
  moveOption: string,
  _heroPosition?: Position
): Position | undefined {
  if (!moveOption) return undefined;
  const lower = moveOption.toLowerCase().trim();

  // Try direct label match (single letter)
  const byLabel = menu.lookup.get(lower);
  if (byLabel) return { ...byLabel.coords };

  // Try name match
  const byName = menu.lookup.get(lower);
  if (byName) return { ...byName.coords };

  // Try fuzzy: find position whose name contains the query
  for (const pos of menu.positions) {
    if (pos.name.toLowerCase().includes(lower) || lower.includes(pos.label.toLowerCase())) {
      return { ...pos.coords };
    }
  }

  return undefined;
}

/** Format the position menu for inclusion in the LLM prompt */
export function formatPositionMenuForPrompt(menu: TacticalPositionMenuResult): string {
  if (menu.positions.length === 0) {
    return 'TACTICAL POSITIONS: Open field, no significant positions.';
  }

  const lines = menu.positions.map(
    (p) =>
      `  ${p.label}: ${p.name} (${p.coords.x}, ${p.coords.y}) \u2014 ${p.coverQuality} cover, ${p.description}`
  );

  return `TACTICAL POSITIONS (pick a letter for moveOption):\n${lines.join('\n')}`;
}

// ── Helpers ──

function clusterCenter(units: { position: Position }[]): Position | undefined {
  if (units.length === 0) return undefined;
  let sumX = 0;
  let sumY = 0;
  for (const unit of units) {
    sumX += unit.position.x;
    sumY += unit.position.y;
  }
  return { x: sumX / units.length, y: sumY / units.length };
}

function dist(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isNearExisting(pos: Position, existing: Position[], radius: number): boolean {
  return existing.some((e) => dist(pos, e) < radius);
}

function isShielded(
  point: Position,
  threat: Position,
  obstacles: BattleObstacle[]
): boolean {
  return obstacles.some((obs) => {
    const d = dist(threat, point);
    const steps = Math.max(1, Math.ceil(d / 10));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sx = threat.x + (point.x - threat.x) * t;
      const sy = threat.y + (point.y - threat.y) * t;
      if (sx >= obs.x - 4 && sx <= obs.x + obs.width + 4 && sy >= obs.y - 4 && sy <= obs.y + obs.height + 4) {
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
  pos: Position
): string {
  const coverStr = providesCover ? 'shielded from enemies' : 'partial cover';
  const threatStr = threat ? describeThreatRelation(pos, threat) : 'no enemies visible';
  return `${coverStr}, ${threatStr}`;
}

function describeThreatRelation(pos: Position, threat: Position | undefined): string {
  if (!threat) return 'no enemies nearby';
  const d = dist(pos, threat);
  const dir = positionToRegion(threat);
  if (d < 150) return `close to enemies (${dir})`;
  if (d < 300) return `mid-range from enemies (${dir})`;
  return `far from enemies (${dir})`;
}
