import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { HeroSummary, HeroDecision, Position } from '../types';
import { refineDecisionPositionForCover } from './cover';

/**
 * Simple rule-based fallback brain.
 * Used when the personality brain or LLM is unavailable.
 */
export class LocalRuleBasedHeroBrain implements IHeroDecisionProvider {
  decide(summary: HeroSummary): HeroDecision {
    const allies = summary.nearbyAllies;
    const enemies = summary.nearbyEnemies;
    let decision: HeroDecision;
    const allyHpPct = allies.length > 0
      ? allies.reduce((sum, ally) => sum + ally.hp / ally.maxHp, 0) / allies.length
      : 1;

    if (enemies.length === 0) {
      return {
        intent: 'hold_position',
        moveTo: { ...summary.heroState.position },
        priority: 'low',
        rationaleTag: 'fallback_no_enemies',
        recheckInSec: 3,
      };
    }

    if (allyHpPct < 0.35) {
      decision = this.protectDecision(allies);
    } else if (allyHpPct < 0.55 && allies.length <= enemies.length) {
      decision = this.holdDecision(summary.heroState.position);
    } else {
      decision = this.advanceDecision(enemies);
    }

    return refineDecisionPositionForCover(summary, decision);
  }

  private advanceDecision(enemies: { position: Position }[]): HeroDecision {
    const center = this.clusterCenter(enemies);
    return {
      intent: 'advance_to_point',
      moveTo: center,
      priority: 'medium',
      rationaleTag: 'advance_toward_enemies',
      recheckInSec: 2,
    };
  }

  private protectDecision(allies: { position: Position; hp: number }[]): HeroDecision {
    if (allies.length === 0) {
      return {
        intent: 'hold_position',
        priority: 'low',
        rationaleTag: 'no_allies_to_protect',
        recheckInSec: 1,
      };
    }

    let weakest = allies[0];
    for (const ally of allies) {
      if (ally.hp < weakest.hp) {
        weakest = ally;
      }
    }

    return {
      intent: 'protect_target',
      moveTo: { ...weakest.position },
      priority: 'medium',
      rationaleTag: 'protect_weakest_ally',
      recheckInSec: 2,
    };
  }

  private holdDecision(heroPos: Position): HeroDecision {
    return {
      intent: 'hold_position',
      moveTo: { ...heroPos },
      priority: 'medium',
      rationaleTag: 'hold_ordered',
      recheckInSec: 3,
    };
  }

  private clusterCenter(units: { position: Position }[]): Position {
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
}
