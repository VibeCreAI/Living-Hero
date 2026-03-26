import { Unit } from '../entities/Unit';
import { Position } from '../types';

const HOLD_ENGAGE_BUFFER = 28;
const ROLE_PREFERENCE_BONUS = 70;

export class TargetingSystem {
  update(alliedUnits: Unit[], enemyUnits: Unit[]): void {
    this.assignTargets(alliedUnits, enemyUnits, true);
    this.assignTargets(enemyUnits, alliedUnits, false);
  }

  private assignTargets(
    units: Unit[],
    opponents: Unit[],
    obeyOrders: boolean
  ): void {
    const aliveOpponents = opponents.filter((opponent) => opponent.isAlive());
    if (aliveOpponents.length === 0) {
      return;
    }

    for (const unit of units) {
      if (!unit.isAlive() || unit.isPassive()) {
        continue;
      }

      if (unit.state.targetId) {
        const currentTarget = opponents.find((opponent) => opponent.id === unit.state.targetId);
        if (currentTarget && currentTarget.isAlive()) {
          if (!obeyOrders || this.isTargetAllowed(unit, currentTarget)) {
            continue;
          }
        }
        unit.state.targetId = undefined;
      }

      if (obeyOrders) {
        const orderedTarget = this.getOrderedTarget(unit, aliveOpponents);
        if (orderedTarget) {
          unit.state.targetId = orderedTarget.id;
          continue;
        }

        if (this.shouldSuppressDefaultTargeting(unit)) {
          unit.state.targetId = undefined;
          continue;
        }
      }

      const nearest = this.findBestTarget(unit, aliveOpponents);
      if (nearest) {
        unit.state.targetId = nearest.id;
      }
    }
  }

  private getOrderedTarget(unit: Unit, opponents: Unit[]): Unit | undefined {
    const orderMode = unit.state.orderMode;
    const orderTargetId = unit.state.orderTargetId;
    const orderPoint = unit.state.orderPoint;
    const orderRadius = unit.state.orderRadius ?? 0;

    if (orderMode === 'focus' && orderTargetId) {
      const focusTarget = opponents.find((opponent) => opponent.id === orderTargetId);
      if (focusTarget && this.isWithinPursuitEnvelope(unit, focusTarget)) {
        return focusTarget;
      }
    }

    if (orderMode === 'hold') {
      return this.findBestTarget(unit, opponents, (opponent) => {
        const withinWeaponReach =
          this.distance(unit.state.position, opponent.state.position) <=
          unit.state.attackRange + HOLD_ENGAGE_BUFFER;
        const withinHoldZone = orderPoint
          ? this.distance(orderPoint, opponent.state.position) <= orderRadius
          : false;
        return withinWeaponReach || withinHoldZone;
      });
    }

    if (orderMode === 'protect') {
      return this.findBestTarget(unit, opponents, (opponent) =>
        orderPoint
          ? this.distance(orderPoint, opponent.state.position) <= orderRadius &&
            this.isWithinPursuitEnvelope(unit, opponent)
          : false
      );
    }

    if (orderMode === 'retreat') {
      return undefined;
    }

    if (orderMode === 'advance') {
      if (orderTargetId) {
        const orderedTarget = opponents.find((opponent) => opponent.id === orderTargetId);
        if (orderedTarget && this.isWithinPursuitEnvelope(unit, orderedTarget)) {
          return orderedTarget;
        }
      }

      return this.findBestTarget(unit, opponents, (opponent) =>
        this.isWithinPursuitEnvelope(unit, opponent)
      );
    }

    return undefined;
  }

  private shouldSuppressDefaultTargeting(unit: Unit): boolean {
    if (
      unit.state.orderMode === 'hold' ||
      unit.state.orderMode === 'protect' ||
      unit.state.orderMode === 'retreat'
    ) {
      return true;
    }

    return false;
  }

  private isTargetAllowed(unit: Unit, target: Unit): boolean {
    const orderMode = unit.state.orderMode;
    const orderPoint = unit.state.orderPoint;
    const orderRadius = unit.state.orderRadius ?? 0;

    if (orderMode === 'focus') {
      return target.id === unit.state.orderTargetId && this.isWithinPursuitEnvelope(unit, target);
    }

    if (orderMode === 'retreat') {
      return false;
    }

    if (orderMode === 'hold') {
      return (
        this.distance(unit.state.position, target.state.position) <=
          unit.state.attackRange + HOLD_ENGAGE_BUFFER ||
        (orderPoint
          ? this.distance(orderPoint, target.state.position) <= orderRadius
          : false)
      );
    }

    if (orderMode === 'protect') {
      return orderPoint
        ? this.distance(orderPoint, target.state.position) <= orderRadius &&
            this.isWithinPursuitEnvelope(unit, target)
        : false;
    }

    if (orderMode === 'advance') {
      return this.isWithinPursuitEnvelope(unit, target);
    }

    return true;
  }

  private findBestTarget(
    unit: Unit,
    opponents: Unit[],
    predicate?: (opponent: Unit) => boolean
  ): Unit | undefined {
    let best: Unit | undefined;
    let bestScore = Infinity;
    const preferredRole = unit.state.orderPreferredTargetRole;

    for (const opponent of opponents) {
      if (predicate && !predicate(opponent)) {
        continue;
      }

      const distance = unit.distanceTo(opponent);
      const score =
        distance -
        (preferredRole && opponent.state.role === preferredRole ? ROLE_PREFERENCE_BONUS : 0);
      if (score < bestScore) {
        bestScore = score;
        best = opponent;
      }
    }

    return best;
  }

  private isWithinPursuitEnvelope(unit: Unit, target: Unit): boolean {
    const orderPoint = unit.state.orderPoint;
    const leashRadius = unit.state.orderLeashRadius;

    if (!orderPoint || !leashRadius) {
      return true;
    }

    const targetDistanceFromAnchor = this.distance(orderPoint, target.state.position);
    if (targetDistanceFromAnchor <= leashRadius) {
      return true;
    }

    return this.distance(unit.state.position, target.state.position) <=
      unit.state.attackRange + HOLD_ENGAGE_BUFFER;
  }

  private distance(a: Position, b: Position): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
