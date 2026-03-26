import { Unit } from '../entities/Unit';
import { DamageEvent } from '../types';
import { ObstacleSystem } from './Obstacles';

export class CombatSystem {
  private obstacles: ObstacleSystem | null = null;

  setObstacles(obstacles: ObstacleSystem): void {
    this.obstacles = obstacles;
  }

  update(alliedUnits: Unit[], enemyUnits: Unit[], dt: number, timeSec: number): DamageEvent[] {
    const events: DamageEvent[] = [];
    this.processCombat(alliedUnits, enemyUnits, dt, timeSec, events);
    this.processCombat(enemyUnits, alliedUnits, dt, timeSec, events);
    return events;
  }

  private processCombat(
    attackers: Unit[],
    defenders: Unit[],
    dt: number,
    timeSec: number,
    events: DamageEvent[]
  ): void {
    for (const attacker of attackers) {
      if (!attacker.isAlive()) continue;
      if (attacker.isPassive()) continue;
      if (!attacker.state.targetId) continue;

      const target = defenders.find((defender) => defender.id === attacker.state.targetId);
      if (!target || !target.isAlive()) continue;

      attacker.faceToward(target.state.position);

      const distance = attacker.distanceTo(target);
      if (distance > attacker.state.attackRange) continue;
      if (
        this.obstacles &&
        !this.obstacles.hasLineOfSight(attacker.state.position, target.state.position, 6)
      ) {
        continue;
      }

      if (attacker.canAttack(dt)) {
        const damage = attacker.performAttack();
        const appliedDamage = target.takeDamage(damage);
        const shouldShowTrainingHit =
          appliedDamage <= 0 && target.isPassive() && target.state.isInvulnerable === true;
        const eventDamage = shouldShowTrainingHit ? damage : appliedDamage;

        if (eventDamage <= 0) {
          continue;
        }
        events.push({
          timeSec,
          attackerId: attacker.id,
          attackerFaction: attacker.state.faction,
          attackerRole: attacker.state.role,
          targetId: target.id,
          targetFaction: target.state.faction,
          targetRole: target.state.role,
          damage: eventDamage,
        });
      }
    }
  }
}
