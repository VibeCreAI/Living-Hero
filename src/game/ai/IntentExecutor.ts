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

    // Apply intent to allied units
    const intent = decision.intent.toLowerCase();

    if (intent.includes('advancing') || intent.includes('focusing')) {
      // Override targets: all allies focus toward the decision target or nearest enemy
      if (decision.targetId) {
        for (const ally of aliveAllies) {
          ally.state.targetId = decision.targetId;
        }
      }
      // Units will naturally move toward targets via MovementSystem
    } else if (intent.includes('protecting')) {
      // Move allies toward hero position (the weakest ally)
      if (decision.moveTo) {
        for (const ally of aliveAllies) {
          // Keep existing targets but cluster near protection point
          // Only retarget if no current target
          if (!ally.state.targetId) {
            const nearest = this.findNearest(ally, aliveEnemies);
            if (nearest) {
              ally.state.targetId = nearest.id;
            }
          }
        }
      }
    } else if (intent.includes('holding')) {
      // Units hold — keep current targets but don't chase far
      // No special override needed; targeting system handles defaults
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
