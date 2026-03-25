import { Unit } from '../entities/Unit';

export class CombatSystem {
  update(alliedUnits: Unit[], enemyUnits: Unit[], dt: number): void {
    this.processCombat(alliedUnits, enemyUnits, dt);
    this.processCombat(enemyUnits, alliedUnits, dt);
  }

  private processCombat(
    attackers: Unit[],
    defenders: Unit[],
    dt: number
  ): void {
    for (const attacker of attackers) {
      if (!attacker.isAlive()) continue;
      if (!attacker.state.targetId) continue;

      const target = defenders.find((d) => d.id === attacker.state.targetId);
      if (!target || !target.isAlive()) continue;

      const dist = attacker.distanceTo(target);
      if (dist > attacker.state.attackRange) continue;

      // Within range — try to attack
      if (attacker.canAttack(dt)) {
        const damage = attacker.performAttack();
        target.takeDamage(damage);
      }
    }
  }
}
