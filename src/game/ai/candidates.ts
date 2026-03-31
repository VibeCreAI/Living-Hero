import { HeroSummary, IntentType, TileCoord, UnitState } from '../types';
import { chooseTacticalAnchor } from './cover';

export interface Candidate {
  intent: IntentType;
  targetId?: string;
  moveToTile?: TileCoord;
  skillId?: string;
}

/** Generate all candidate intents from the current battlefield state. */
export function generateCandidates(summary: HeroSummary): Candidate[] {
  const candidates: Candidate[] = [];
  const alliesCenter = clusterCenter(summary, summary.nearbyAllies.map((ally) => ally.tile));

  // Always available: hold position
  candidates.push({
    intent: 'hold_position',
    moveToTile: chooseTacticalAnchor(summary, 'hold', summary.heroState.tile),
  });

  // Advance toward enemy cluster
  if (summary.nearbyEnemies.length > 0) {
    const forwardPoint = getForwardPoint(summary);
    candidates.push({
      intent: 'advance_to_point',
      moveToTile: chooseTacticalAnchor(summary, 'advance', forwardPoint),
    });
  }

  // Protect most threatened ally
  if (summary.nearbyAllies.length > 0) {
    const threatened = getMostThreatenedAlly(summary);
    if (threatened) {
      candidates.push({
        intent: 'protect_target',
        targetId: threatened.id,
        moveToTile: chooseTacticalAnchor(summary, 'protect', threatened.tile),
      });
    }
  }

  // Focus weakest / highest-threat enemy
  if (summary.nearbyEnemies.length > 0) {
    const target = getBestFocusTarget(summary);
    if (target) {
      candidates.push({
        intent: 'focus_enemy',
        targetId: target.id,
        moveToTile: { ...target.tile },
      });
    }
  }

  // Retreat to safe point
  const safePoint = getSafePoint(summary);
  candidates.push({
    intent: 'retreat_to_point',
    moveToTile: chooseTacticalAnchor(summary, 'retreat', safePoint),
  });

  if (summary.obstacles.length > 0 && alliesCenter) {
    candidates.push({
      intent: 'hold_position',
      moveToTile: chooseTacticalAnchor(summary, 'hold', alliesCenter),
    });
  }

  return candidates;
}

/** Center of enemy positions — the "forward" engagement point. */
function getForwardPoint(summary: HeroSummary): TileCoord {
  return clusterCenter(summary, summary.nearbyEnemies.map((enemy) => enemy.tile));
}

/** Ally with lowest HP percentage. */
function getMostThreatenedAlly(summary: HeroSummary): UnitState | undefined {
  let weakest: UnitState | undefined;
  let lowestPct = Infinity;

  for (const ally of summary.nearbyAllies) {
    const pct = ally.hp / ally.maxHp;
    if (pct < lowestPct) {
      lowestPct = pct;
      weakest = ally;
    }
  }

  return weakest;
}

/** Enemy with lowest HP — easiest to finish off. */
function getBestFocusTarget(summary: HeroSummary): UnitState | undefined {
  let target: UnitState | undefined;
  let lowestHp = Infinity;

  for (const enemy of summary.nearbyEnemies) {
    if (enemy.hp < lowestHp) {
      lowestHp = enemy.hp;
      target = enemy;
    }
  }

  return target;
}

/** Safe point: behind allied lines (left side of battlefield). */
function getSafePoint(summary: HeroSummary): TileCoord {
  if (summary.nearbyAllies.length > 0) {
    const center = clusterCenter(summary, summary.nearbyAllies.map((ally) => ally.tile));
    return {
      col: Math.max(1, center.col - 2),
      row: center.row,
    };
  }
  return { col: 1, row: Math.floor(summary.grid.rows / 2) };
}

function clusterCenter(summary: HeroSummary, tiles: TileCoord[]): TileCoord {
  if (tiles.length === 0) {
    return { col: Math.floor(summary.grid.cols / 2), row: Math.floor(summary.grid.rows / 2) };
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
