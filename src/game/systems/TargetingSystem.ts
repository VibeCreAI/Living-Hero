import { Unit } from '../entities/Unit';
import { PlayerCommand } from '../types';

export class TargetingSystem {
  update(
    alliedUnits: Unit[],
    enemyUnits: Unit[],
    command?: PlayerCommand
  ): void {
    this.assignTargets(alliedUnits, enemyUnits, command);
    this.assignTargets(enemyUnits, alliedUnits);
  }

  private assignTargets(
    units: Unit[],
    opponents: Unit[],
    command?: PlayerCommand
  ): void {
    const aliveOpponents = opponents.filter((o) => o.isAlive());
    if (aliveOpponents.length === 0) return;

    for (const unit of units) {
      if (!unit.isAlive()) continue;

      // Check if current target is still valid
      if (unit.state.targetId) {
        const currentTarget = opponents.find((o) => o.id === unit.state.targetId);
        if (currentTarget && currentTarget.isAlive()) continue;
        unit.state.targetId = undefined;
      }

      // Focus command overrides targeting
      if (command?.type === 'focus' && command.targetId) {
        const focusTarget = aliveOpponents.find((o) => o.id === command.targetId);
        if (focusTarget) {
          unit.state.targetId = focusTarget.id;
          continue;
        }
      }

      // Default: assign nearest enemy
      let nearest: Unit | undefined;
      let nearestDist = Infinity;

      for (const opponent of aliveOpponents) {
        const dist = unit.distanceTo(opponent);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = opponent;
        }
      }

      if (nearest) {
        unit.state.targetId = nearest.id;
      }
    }
  }
}
