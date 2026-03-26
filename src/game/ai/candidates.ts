import { HeroSummary, IntentType, Position, UnitState } from '../types';
import { chooseTacticalAnchor } from './cover';

export interface Candidate {
  intent: IntentType;
  targetId?: string;
  moveTo?: Position;
  skillId?: string;
}

/** Generate all candidate intents from the current battlefield state. */
export function generateCandidates(summary: HeroSummary): Candidate[] {
  const candidates: Candidate[] = [];
  const alliesCenter = clusterCenter(summary.nearbyAllies);

  // Always available: hold position
  candidates.push({
    intent: 'hold_position',
    moveTo: chooseTacticalAnchor(summary, 'hold', summary.heroState.position),
  });

  // Advance toward enemy cluster
  if (summary.nearbyEnemies.length > 0) {
    const forwardPoint = getForwardPoint(summary);
    candidates.push({
      intent: 'advance_to_point',
      moveTo: chooseTacticalAnchor(summary, 'advance', forwardPoint),
    });
  }

  // Protect most threatened ally
  if (summary.nearbyAllies.length > 0) {
    const threatened = getMostThreatenedAlly(summary);
    if (threatened) {
      candidates.push({
        intent: 'protect_target',
        targetId: threatened.id,
        moveTo: chooseTacticalAnchor(summary, 'protect', threatened.position),
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
        moveTo: { ...target.position },
      });
    }
  }

  // Retreat to safe point
  const safePoint = getSafePoint(summary);
  candidates.push({
    intent: 'retreat_to_point',
    moveTo: chooseTacticalAnchor(summary, 'retreat', safePoint),
  });

  if (summary.obstacles.length > 0 && alliesCenter) {
    candidates.push({
      intent: 'hold_position',
      moveTo: chooseTacticalAnchor(summary, 'hold', alliesCenter),
    });
  }

  return candidates;
}

/** Center of enemy positions — the "forward" engagement point. */
function getForwardPoint(summary: HeroSummary): Position {
  return clusterCenter(summary.nearbyEnemies);
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
function getSafePoint(summary: HeroSummary): Position {
  if (summary.nearbyAllies.length > 0) {
    const center = clusterCenter(summary.nearbyAllies);
    // Move behind allies (further left)
    return { x: Math.max(50, center.x - 100), y: center.y };
  }
  return { x: 80, y: 384 };
}

function clusterCenter(units: { position: Position }[]): Position {
  if (units.length === 0) return { x: 512, y: 384 };

  let sumX = 0;
  let sumY = 0;
  for (const u of units) {
    sumX += u.position.x;
    sumY += u.position.y;
  }
  return {
    x: sumX / units.length,
    y: sumY / units.length,
  };
}
