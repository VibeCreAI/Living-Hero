import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { HeroSummary, HeroDecision, Position } from '../types';

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
      intent: 'Advancing!',
      moveTo: center,
      recheckInSec: 2,
    };
  }

  private protectDecision(allies: { position: Position; hp: number }[]): HeroDecision {
    if (allies.length === 0) {
      return { intent: 'No allies to protect', recheckInSec: 1 };
    }

    // Find lowest HP ally
    let weakest = allies[0];
    for (const ally of allies) {
      if (ally.hp < weakest.hp) {
        weakest = ally;
      }
    }

    return {
      intent: 'Protecting weakest ally',
      moveTo: { ...weakest.position },
      recheckInSec: 2,
    };
  }

  private holdDecision(heroPos: Position): HeroDecision {
    return {
      intent: 'Holding position',
      moveTo: { ...heroPos },
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
          intent: `Focusing ${targetId}`,
          targetId,
          moveTo: { ...target.position },
          recheckInSec: 2,
        };
      }
    }

    // Fallback: focus nearest
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
