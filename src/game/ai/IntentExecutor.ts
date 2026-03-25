import { HeroDecision } from '../types';
import { Hero } from '../entities/Hero';
import { Unit } from '../entities/Unit';

export class IntentExecutor {
  execute(
    hero: Hero,
    decision: HeroDecision,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): void {
    const aliveAllies = alliedUnits.filter((u) => u.isAlive());
    const aliveEnemies = enemyUnits.filter((u) => u.isAlive());

    // Move hero marker to decision position
    if (decision.moveTo) {
      hero.setPosition(decision.moveTo);
    }

    switch (decision.intent) {
      case 'advance_to_point':
      case 'focus_enemy':
        // Override targets: all allies focus toward the decision target or nearest enemy
        if (decision.targetId) {
          for (const ally of aliveAllies) {
            ally.state.targetId = decision.targetId;
          }
        }
        break;

      case 'protect_target':
        // Ensure all allies have targets while clustering near protection point
        for (const ally of aliveAllies) {
          if (!ally.state.targetId) {
            const nearest = this.findNearest(ally, aliveEnemies);
            if (nearest) {
              ally.state.targetId = nearest.id;
            }
          }
        }
        break;

      case 'retreat_to_point':
        // Clear targets so units disengage and move toward retreat point
        for (const ally of aliveAllies) {
          ally.state.targetId = undefined;
        }
        break;

      case 'hold_position':
      case 'use_skill':
        // Keep current targets, no special override
        break;
    }
  }

  private findNearest(unit: Unit, enemies: Unit[]): Unit | undefined {
    let nearest: Unit | undefined;
    let nearestDist = Infinity;

    for (const enemy of enemies) {
      const dist = unit.distanceTo(enemy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }

    return nearest;
  }
}
