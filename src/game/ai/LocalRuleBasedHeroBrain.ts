import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { HeroSummary, HeroDecision, Position } from '../types';

/**
 * Simple rule-based fallback brain.
 * Used when the personality brain or LLM is unavailable.
 */
export class LocalRuleBasedHeroBrain implements IHeroDecisionProvider {
  decide(summary: HeroSummary): HeroDecision {
    const command = summary.currentCommand;
    const allies = summary.nearbyAllies;
    const enemies = summary.nearbyEnemies;

    if (!command || command.type === 'advance') {
      return this.advanceDecision(enemies);
    }

    switch (command.type) {
      case 'protect':
        return this.protectDecision(allies);
      case 'hold':
        return this.holdDecision(summary.heroState.position);
      case 'focus':
        return this.focusDecision(command.targetId, enemies);
      default:
        return this.advanceDecision(enemies);
    }
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

  private focusDecision(
    targetId: string | undefined,
    enemies: { id: string; position: Position }[]
  ): HeroDecision {
    if (targetId) {
      const target = enemies.find((e) => e.id === targetId);
      if (target) {
        return {
          intent: 'focus_enemy',
          targetId,
          moveTo: { ...target.position },
          priority: 'high',
          rationaleTag: 'focus_ordered_target',
          recheckInSec: 2,
        };
      }
    }

    return this.advanceDecision(enemies);
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
