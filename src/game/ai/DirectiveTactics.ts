import { GroupOrder, HeroDecision, HeroSummary, Position, UnitState } from '../types';
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
          { ...harasser.position },
          'directive_counter_harasser'
        );
      }
      return refineDecisionPositionForCover(summary, {
        ...directive,
        moveTo: directive.moveTo ?? summary.heroState.position,
        rationaleTag: `directive_${directive.rationaleTag}`,
      });

    case 'protect_target': {
      const weakAlly = getMostThreatenedAlly(summary.nearbyAllies);
      if (harasser && weakAlly) {
        return buildHarasserCounterDecision(
          directive,
          harasser,
          midpoint(weakAlly.position, harasser.position),
          'directive_screen_harasser'
        );
      }
      return refineDecisionPositionForCover(summary, {
        ...directive,
        moveTo: directive.moveTo ?? weakAlly?.position ?? summary.heroState.position,
        rationaleTag: `directive_${directive.rationaleTag}`,
      });
    }

    case 'retreat_to_point': {
      const retreatPoint = directive.moveTo ?? summary.heroState.position;
      const avgDistanceToRetreat = averageDistance(summary.nearbyAllies, retreatPoint);
      if (avgDistanceToRetreat < 55 && !harasser) {
        return refineDecisionPositionForCover(summary, {
          intent: 'hold_position',
          moveTo: { ...retreatPoint },
          priority: 'medium',
          rationaleTag: 'directive_hold_retreated_position',
          recheckInSec: 2,
        });
      }
      return refineDecisionPositionForCover(summary, {
        ...directive,
        moveTo: retreatPoint,
        rationaleTag: `directive_${directive.rationaleTag}`,
      });
    }

    case 'advance_to_point':
      return refineDecisionPositionForCover(summary, {
        ...directive,
        moveTo: directive.moveTo ?? clusterCenter(summary.nearbyEnemies) ?? summary.heroState.position,
        rationaleTag: `directive_${directive.rationaleTag}`,
      });

    case 'focus_enemy': {
      const target = directive.targetId
        ? summary.nearbyEnemies.find((enemy) => enemy.id === directive.targetId)
        : undefined;
      if (target) {
        return {
          ...directive,
          moveTo: { ...target.position },
          rationaleTag: `directive_${directive.rationaleTag}`,
        };
      }

      if (harasser) {
        return buildHarasserCounterDecision(
          directive,
          harasser,
          { ...harasser.position },
          'directive_retarget_harasser'
        );
      }

      return {
        intent: 'advance_to_point',
        moveTo: clusterCenter(summary.nearbyEnemies) ?? summary.heroState.position,
        priority: directive.priority,
        rationaleTag: 'directive_focus_target_lost',
        recheckInSec: 2,
      };
    }

    case 'use_skill':
      return directive;
  }
}

export function adaptReactiveDecision(
  summary: HeroSummary,
  decision: HeroDecision
): HeroDecision {
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
        { ...harasser.position },
        'reactive_counter_harasser'
      );

    case 'retreat_to_point': {
      const retreatPoint = decision.moveTo ?? summary.heroState.position;
      const closeToRetreat = averageDistance(summary.nearbyAllies, retreatPoint) < 70;
      if (closeToRetreat) {
        return buildHarasserCounterDecision(
          decision,
          harasser,
          { ...harasser.position },
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
  const recentThreat = findRecentDamageThreat(summary);
  if (recentThreat) {
    return recentThreat;
  }

  return findInferredHarasser(summary);
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
    const score =
      totalDamage * 1.5 +
      hits.length * 6 +
      distinctVictims * 5 -
      timePressure;

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
      const distance = dist(enemy.position, ally.position);
      const enemyCanHit = distance <= enemy.attackRange + HARASS_RANGE_BUFFER;
      const allyCanHit = distance <= ally.attackRange + HARASS_RANGE_BUFFER;

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

    const rangeAdvantage = Math.max(
      0,
      enemy.attackRange - averageAttackRange(summary.nearbyAllies)
    );
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

function averageDistance(units: UnitState[], point: Position): number {
  if (units.length === 0) {
    return 0;
  }

  return units.reduce((sum, unit) => sum + dist(unit.position, point), 0) / units.length;
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

function midpoint(a: Position, b: Position): Position {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function dist(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildHarasserCounterDecision(
  baseDecision: HeroDecision,
  harasser: UnitState,
  moveTo: Position,
  rationaleTag: string
): HeroDecision {
  return {
    intent: 'focus_enemy',
    targetId: harasser.id,
    moveTo,
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
    moveTo: { ...harasser.position },
  });

  return preserved;
}
