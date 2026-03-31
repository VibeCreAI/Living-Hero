import { GroupOrder, HeroDecision, HeroSummary, TileCoord, UnitState } from '../types';
import { refineDecisionPositionForCover } from './cover';

interface HarassThreat {
  enemy: UnitState;
  score: number;
}

const HARASS_RANGE_BUFFER = 24;
const HARASS_SCORE_THRESHOLD = 18;

export function adaptDirectiveDecision(
  summary: HeroSummary,
  directive: HeroDecision
): HeroDecision {
  const harasser = findHarassingEnemy(summary);

  switch (directive.intent) {
    case 'hold_position':
      if (harasser) {
        return buildHarasserCounterDecision(
          directive,
          harasser,
          { ...harasser.tile },
          'directive_counter_harasser'
        );
      }
      return refineDecisionPositionForCover(summary, {
        ...directive,
        moveToTile: directive.moveToTile ?? summary.heroState.tile,
        rationaleTag: `directive_${directive.rationaleTag}`,
      });

    case 'protect_target': {
      const weakAlly = getMostThreatenedAlly(summary.nearbyAllies);
      if (harasser && weakAlly) {
        return buildHarasserCounterDecision(
          directive,
          harasser,
          midpointTile(weakAlly.tile, harasser.tile),
          'directive_screen_harasser'
        );
      }
      return refineDecisionPositionForCover(summary, {
        ...directive,
        moveToTile: directive.moveToTile ?? weakAlly?.tile ?? summary.heroState.tile,
        rationaleTag: `directive_${directive.rationaleTag}`,
      });
    }

    case 'retreat_to_point': {
      const retreatTile = directive.moveToTile ?? summary.heroState.tile;
      const avgDistanceToRetreat = averageDistance(summary.nearbyAllies, retreatTile);
      if (avgDistanceToRetreat < 2 && !harasser) {
        return refineDecisionPositionForCover(summary, {
          intent: 'hold_position',
          moveToTile: { ...retreatTile },
          priority: 'medium',
          rationaleTag: 'directive_hold_retreated_position',
          recheckInSec: 2,
        });
      }
      return refineDecisionPositionForCover(summary, {
        ...directive,
        moveToTile: retreatTile,
        rationaleTag: `directive_${directive.rationaleTag}`,
      });
    }

    case 'advance_to_point':
      return refineDecisionPositionForCover(summary, {
        ...directive,
        moveToTile:
          directive.moveToTile ??
          clusterCenter(summary.nearbyEnemies.map((enemy) => enemy.tile), summary) ??
          summary.heroState.tile,
        rationaleTag: `directive_${directive.rationaleTag}`,
      });

    case 'focus_enemy': {
      const target = directive.targetId
        ? summary.nearbyEnemies.find((enemy) => enemy.id === directive.targetId)
        : undefined;
      if (target) {
        return {
          ...directive,
          moveToTile: { ...target.tile },
          rationaleTag: `directive_${directive.rationaleTag}`,
        };
      }

      if (harasser) {
        return buildHarasserCounterDecision(
          directive,
          harasser,
          { ...harasser.tile },
          'directive_retarget_harasser'
        );
      }

      return {
        intent: 'advance_to_point',
        moveToTile:
          clusterCenter(summary.nearbyEnemies.map((enemy) => enemy.tile), summary) ??
          summary.heroState.tile,
        priority: directive.priority,
        rationaleTag: 'directive_focus_target_lost',
        recheckInSec: 2,
      };
    }

    case 'use_skill':
      return directive;
  }
}

export function adaptReactiveDecision(summary: HeroSummary, decision: HeroDecision): HeroDecision {
  const harasser = findHarassingEnemy(summary);
  if (!harasser) {
    return refineDecisionPositionForCover(summary, decision);
  }

  switch (decision.intent) {
    case 'hold_position':
    case 'protect_target':
      return buildHarasserCounterDecision(
        decision,
        harasser,
        { ...harasser.tile },
        'reactive_counter_harasser'
      );

    case 'retreat_to_point': {
      const retreatTile = decision.moveToTile ?? summary.heroState.tile;
      const closeToRetreat = averageDistance(summary.nearbyAllies, retreatTile) < 2;
      if (closeToRetreat) {
        return buildHarasserCounterDecision(
          decision,
          harasser,
          { ...harasser.tile },
          'reactive_counter_harasser'
        );
      }
      return refineDecisionPositionForCover(summary, decision);
    }

    default:
      return refineDecisionPositionForCover(summary, decision);
  }
}

function findHarassingEnemy(summary: HeroSummary): UnitState | undefined {
  return findRecentDamageThreat(summary) ?? findInferredHarasser(summary);
}

function findRecentDamageThreat(summary: HeroSummary): UnitState | undefined {
  const recentHits = summary.recentDamage.filter(
    (event) => event.targetFaction === 'allied' && event.attackerFaction === 'enemy'
  );
  if (recentHits.length === 0) {
    return undefined;
  }

  let bestEnemy: UnitState | undefined;
  let bestScore = -1;

  for (const enemy of summary.nearbyEnemies) {
    const hits = recentHits.filter((event) => event.attackerId === enemy.id);
    if (hits.length === 0) {
      continue;
    }

    const totalDamage = hits.reduce((sum, event) => sum + event.damage, 0);
    const distinctVictims = new Set(hits.map((event) => event.targetId)).size;
    const timePressure = hits.reduce((sum, event) => sum + Math.max(0, summary.timeSec - event.timeSec), 0);
    const score = totalDamage * 1.5 + hits.length * 6 + distinctVictims * 5 - timePressure;

    if (score > bestScore) {
      bestScore = score;
      bestEnemy = enemy;
    }
  }

  return bestEnemy;
}

function findInferredHarasser(summary: HeroSummary): UnitState | undefined {
  let bestThreat: HarassThreat | undefined;

  for (const enemy of summary.nearbyEnemies) {
    let threatenedAllies = 0;
    let unsupportedShots = 0;

    for (const ally of summary.nearbyAllies) {
      const distance = tileDistance(enemy.tile, ally.tile);
      const enemyCanHit = distance <= enemy.attackRange / summary.grid.tileWidth + HARASS_RANGE_BUFFER / summary.grid.tileWidth;
      const allyCanHit = distance <= ally.attackRange / summary.grid.tileWidth + HARASS_RANGE_BUFFER / summary.grid.tileWidth;

      if (!enemyCanHit) {
        continue;
      }

      threatenedAllies++;
      if (!allyCanHit) {
        unsupportedShots++;
      }
    }

    if (threatenedAllies === 0 || unsupportedShots === 0) {
      continue;
    }

    const rangeAdvantage = Math.max(0, enemy.attackRange - averageAttackRange(summary.nearbyAllies));
    const score =
      unsupportedShots * 10 +
      threatenedAllies * 4 +
      enemy.attack * 0.5 +
      rangeAdvantage * 0.05;

    if (score < HARASS_SCORE_THRESHOLD) {
      continue;
    }

    if (!bestThreat || score > bestThreat.score) {
      bestThreat = { enemy, score };
    }
  }

  return bestThreat?.enemy;
}

function getMostThreatenedAlly(allies: UnitState[]): UnitState | undefined {
  let weakest: UnitState | undefined;
  let weakestPct = Infinity;

  for (const ally of allies) {
    const pct = ally.hp / ally.maxHp;
    if (pct < weakestPct) {
      weakestPct = pct;
      weakest = ally;
    }
  }

  return weakest;
}

function averageAttackRange(allies: UnitState[]): number {
  if (allies.length === 0) {
    return 0;
  }
  return allies.reduce((sum, ally) => sum + ally.attackRange, 0) / allies.length;
}

function averageDistance(units: UnitState[], tile: TileCoord): number {
  if (units.length === 0) {
    return 0;
  }
  return units.reduce((sum, unit) => sum + tileDistance(unit.tile, tile), 0) / units.length;
}

function clusterCenter(
  tiles: TileCoord[],
  summary: HeroSummary
): TileCoord | undefined {
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
    col: Math.max(0, Math.min(summary.grid.cols - 1, Math.round(sumCol / tiles.length))),
    row: Math.max(0, Math.min(summary.grid.rows - 1, Math.round(sumRow / tiles.length))),
  };
}

function midpointTile(a: TileCoord, b: TileCoord): TileCoord {
  return {
    col: Math.round((a.col + b.col) / 2),
    row: Math.round((a.row + b.row) / 2),
  };
}

function tileDistance(a: TileCoord, b: TileCoord): number {
  return Math.hypot(a.col - b.col, a.row - b.row);
}

function buildHarasserCounterDecision(
  baseDecision: HeroDecision,
  harasser: UnitState,
  moveToTile: TileCoord,
  rationaleTag: string
): HeroDecision {
  return {
    intent: 'focus_enemy',
    targetId: harasser.id,
    moveToTile,
    groupOrders: upsertWarriorCounterOrder(baseDecision.groupOrders, harasser),
    priority: 'high',
    rationaleTag,
    recheckInSec: 1.5,
  };
}

function upsertWarriorCounterOrder(
  groupOrders: GroupOrder[] | undefined,
  harasser: UnitState
): GroupOrder[] | undefined {
  if (!groupOrders?.length) {
    return undefined;
  }

  const preserved = groupOrders.filter((groupOrder) => groupOrder.group !== 'warriors');
  preserved.push({
    group: 'warriors',
    intent: 'focus_enemy',
    targetId: harasser.id,
    moveToTile: { ...harasser.tile },
  });

  return preserved;
}
