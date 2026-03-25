import { Unit } from '../entities/Unit';

export class MovementSystem {
  update(alliedUnits: Unit[], enemyUnits: Unit[], dt: number): void {
    this.moveUnitsTowardTargets(alliedUnits, enemyUnits, dt);
    this.moveUnitsTowardTargets(enemyUnits, alliedUnits, dt);
  }

  private moveUnitsTowardTargets(
    units: Unit[],
    opponents: Unit[],
    dt: number
  ): void {
    for (const unit of units) {
      if (!unit.isAlive()) continue;
      if (!unit.state.targetId) continue;

      const target = opponents.find((o) => o.id === unit.state.targetId);
      if (!target || !target.isAlive()) {
        unit.state.targetId = undefined;
        unit.setAnimState('idle');
        continue;
      }

      const dist = unit.distanceTo(target);

      // Stop moving when within attack range
      if (dist <= unit.state.attackRange) {
        if (unit.state.state === 'moving') {
          unit.setAnimState('idle');
        }
        continue;
      }

      unit.moveToward(target.state.position, dt);
    }
  }
}
