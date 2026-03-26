import { Unit } from '../entities/Unit';
import { Position } from '../types';
import { ObstacleSystem } from './Obstacles';

interface NavigationState {
  path: Position[];
  waypointIndex: number;
  destinationKey?: string;
  lastDestination?: Position;
  repathCooldown: number;
  stuckTime: number;
}

const REPATH_INTERVAL = 0.25;
const TARGET_SHIFT_REPATH = 28;
const WAYPOINT_REACHED_DISTANCE = 10;
const STUCK_REPATH_DELAY = 0.35;
const ENGAGE_LINE_OF_SIGHT_PADDING = 6;
const ORDER_SLOT_PADDING = 10;
const ORDER_SLOT_COUNT = 8;
const MAP_WIDTH = 1024;
const MAP_HEIGHT = 768;
const MAP_PADDING = 20;

export class MovementSystem {
  private obstacles: ObstacleSystem | null = null;
  private navigation = new Map<string, NavigationState>();

  setObstacles(obstacles: ObstacleSystem): void {
    this.obstacles = obstacles;
  }

  update(alliedUnits: Unit[], enemyUnits: Unit[], dt: number): void {
    this.moveUnitsTowardTargets(alliedUnits, enemyUnits, dt);
    this.moveUnitsTowardTargets(enemyUnits, alliedUnits, dt);
    this.pruneNavigation([...alliedUnits, ...enemyUnits]);
  }

  private moveUnitsTowardTargets(
    units: Unit[],
    opponents: Unit[],
    dt: number
  ): void {
    for (const unit of units) {
      if (!unit.isAlive() || unit.isPassive()) {
        this.clearNavigation(unit.id);
        continue;
      }

      const orderDestination = this.getOrderDestination(unit);
      const orderNavigationKey = orderDestination
        ? this.buildOrderNavigationKey(unit, orderDestination)
        : undefined;

      if (!unit.state.targetId) {
        if (orderDestination) {
          this.moveWithNavigationToPosition(unit, orderDestination, dt, orderNavigationKey!);
        } else {
          this.clearNavigation(unit.id);
          if (unit.state.state === 'moving') {
            unit.setAnimState('idle');
          }
        }
        continue;
      }

      const target = opponents.find((opponent) => opponent.id === unit.state.targetId);
      if (!target || !target.isAlive()) {
        unit.state.targetId = undefined;
        if (orderDestination) {
          this.moveWithNavigationToPosition(unit, orderDestination, dt, orderNavigationKey!);
        } else {
          this.clearNavigation(unit.id);
          unit.setAnimState('idle');
        }
        continue;
      }

      if (!this.isPursuitAllowed(unit, target)) {
        unit.state.targetId = undefined;
        if (orderDestination) {
          this.moveWithNavigationToPosition(unit, orderDestination, dt, orderNavigationKey!);
        } else {
          this.clearNavigation(unit.id);
          unit.setAnimState('idle');
        }
        continue;
      }

      if (this.canEngageTarget(unit, target)) {
        if (unit.state.state === 'moving') {
          unit.setAnimState('idle');
        }
        this.clearNavigation(unit.id);
        continue;
      }

      this.moveWithNavigationToPosition(unit, target.state.position, dt, `target:${target.id}`);
    }
  }

  private moveWithNavigationToPosition(
    unit: Unit,
    destination: Position,
    dt: number,
    destinationKey: string
  ): void {
    if (!this.obstacles) {
      unit.moveToward(destination, dt);
      return;
    }

    const state = this.getNavigationState(unit.id, dt);
    const navigableDestination = this.resolveNavigableDestination(destination);

    if (this.obstacles.hasLineOfSight(unit.state.position, navigableDestination)) {
      state.path = [];
      state.waypointIndex = 0;
      state.destinationKey = destinationKey;
      state.lastDestination = { ...navigableDestination };
      state.stuckTime = 0;
      this.stepToward(unit, navigableDestination, dt);
      return;
    }

    if (this.shouldRepath(state, destinationKey, navigableDestination)) {
      const path = this.obstacles.findPath(unit.state.position, navigableDestination);
      state.path = path ?? [];
      state.waypointIndex = 0;
      state.destinationKey = destinationKey;
      state.lastDestination = { ...navigableDestination };
      state.repathCooldown = REPATH_INTERVAL;
      state.stuckTime = 0;
    }

    const moveTarget = this.resolveMoveTarget(unit, navigableDestination, state);
    const before = { ...unit.state.position };
    const moved = this.stepToward(unit, moveTarget, dt);
    const progress = Math.hypot(
      unit.state.position.x - before.x,
      unit.state.position.y - before.y
    );
    const expectedStep = unit.state.moveSpeed * dt;

    if (moved && progress >= expectedStep * 0.2) {
      state.stuckTime = 0;
      return;
    }

    state.stuckTime += dt;
    if (state.stuckTime >= STUCK_REPATH_DELAY) {
      state.path = [];
      state.waypointIndex = 0;
      state.repathCooldown = 0;
      state.destinationKey = destinationKey;
      state.lastDestination = { ...navigableDestination };
    }
  }

  private resolveMoveTarget(
    unit: Unit,
    targetPosition: Position,
    state: NavigationState
  ): Position {
    if (!this.obstacles || state.path.length === 0) {
      return targetPosition;
    }

    while (state.waypointIndex < state.path.length) {
      const waypoint = state.path[state.waypointIndex];
      if (this.distance(unit.state.position, waypoint) <= WAYPOINT_REACHED_DISTANCE) {
        state.waypointIndex++;
        continue;
      }
      break;
    }

    if (state.waypointIndex >= state.path.length) {
      return targetPosition;
    }

    let furthestVisible = state.waypointIndex;
    for (let i = state.waypointIndex + 1; i < state.path.length; i++) {
      if (!this.obstacles.hasLineOfSight(unit.state.position, state.path[i])) {
        break;
      }
      furthestVisible = i;
    }

    state.waypointIndex = furthestVisible;
    return state.path[state.waypointIndex];
  }

  private stepToward(unit: Unit, moveTarget: Position, dt: number): boolean {
    if (!this.obstacles) {
      unit.moveToward(moveTarget, dt);
      return true;
    }

    const dx = moveTarget.x - unit.state.position.x;
    const dy = moveTarget.y - unit.state.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 2) {
      if (unit.state.state === 'moving') {
        unit.setAnimState('idle');
      }
      return false;
    }

    unit.updateFacingFromDelta(dx);

    const step = Math.min(unit.state.moveSpeed * dt, distance);
    const nextPosition = {
      x: unit.state.position.x + (dx / distance) * step,
      y: unit.state.position.y + (dy / distance) * step,
    };
    const resolved = this.obstacles.pushOut(nextPosition);
    const movedDistance = Math.hypot(
      resolved.x - unit.state.position.x,
      resolved.y - unit.state.position.y
    );

    if (movedDistance < 0.1) {
      if (unit.state.state === 'moving') {
        unit.setAnimState('idle');
      }
      return false;
    }

    unit.state.position.x = resolved.x;
    unit.state.position.y = resolved.y;
    unit.sprite.setPosition(resolved.x, resolved.y);
    unit.setAnimState('moving');
    return true;
  }

  private shouldRepath(
    state: NavigationState,
    destinationKey: string,
    destination: Position
  ): boolean {
    if (state.destinationKey !== destinationKey) {
      return true;
    }

    if (!state.lastDestination) {
      return true;
    }

    if (state.path.length === 0 || state.waypointIndex >= state.path.length) {
      return true;
    }

    if (state.repathCooldown > 0) {
      return false;
    }

    return this.distance(state.lastDestination, destination) >= TARGET_SHIFT_REPATH;
  }

  private getNavigationState(unitId: string, dt: number): NavigationState {
    const existing = this.navigation.get(unitId);
    if (existing) {
      existing.repathCooldown = Math.max(0, existing.repathCooldown - dt);
      return existing;
    }

    const state: NavigationState = {
      path: [],
      waypointIndex: 0,
      repathCooldown: 0,
      stuckTime: 0,
    };
    this.navigation.set(unitId, state);
    return state;
  }

  private pruneNavigation(units: Unit[]): void {
    const activeIds = new Set(
      units.filter((unit) => unit.isAlive() && !unit.isPassive()).map((unit) => unit.id)
    );

    for (const unitId of this.navigation.keys()) {
      if (!activeIds.has(unitId)) {
        this.navigation.delete(unitId);
      }
    }
  }

  private clearNavigation(unitId: string): void {
    this.navigation.delete(unitId);
  }

  private distance(a: Position, b: Position): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private getOrderDestination(unit: Unit): Position | null {
    if (!unit.state.orderPoint) {
      return null;
    }

    const anchor = unit.state.orderPoint;
    const seed = this.hash(unit.id);
    const angle = (seed % 360) * (Math.PI / 180);
    const baseRadius = unit.state.role === 'warrior' ? 24 : 46;
    const variance = (seed % 3) * 8;
    const radius = Math.min((unit.state.orderRadius ?? 80) * 0.55, baseRadius + variance);
    const angleStep = (Math.PI * 2) / ORDER_SLOT_COUNT;

    for (let i = 0; i < ORDER_SLOT_COUNT; i++) {
      const slot = this.clampToMap({
        x: anchor.x + Math.cos(angle + i * angleStep) * radius,
        y: anchor.y + Math.sin(angle + i * angleStep) * radius,
      });

      if (this.obstacles && this.obstacles.isBlocked(slot, ORDER_SLOT_PADDING)) {
        continue;
      }

      return slot;
    }

    return this.resolveNavigableDestination(anchor);
  }

  private buildOrderNavigationKey(unit: Unit, destination: Position): string {
    return [
      'order',
      unit.state.orderMode ?? 'none',
      Math.round(destination.x),
      Math.round(destination.y),
    ].join(':');
  }

  private isPursuitAllowed(unit: Unit, target: Unit): boolean {
    const orderPoint = unit.state.orderPoint;
    const leashRadius = unit.state.orderLeashRadius;

    if (!orderPoint || !leashRadius) {
      return true;
    }

    const targetDistanceFromAnchor = this.distance(orderPoint, target.state.position);
    if (targetDistanceFromAnchor <= leashRadius) {
      return true;
    }

    return unit.distanceTo(target) <= unit.state.attackRange;
  }

  private canEngageTarget(unit: Unit, target: Unit): boolean {
    if (unit.distanceTo(target) > unit.state.attackRange) {
      return false;
    }

    if (!this.obstacles) {
      return true;
    }

    return this.obstacles.hasLineOfSight(
      unit.state.position,
      target.state.position,
      ENGAGE_LINE_OF_SIGHT_PADDING
    );
  }

  private hash(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  private resolveNavigableDestination(destination: Position): Position {
    const clamped = this.clampToMap(destination);
    if (!this.obstacles) {
      return clamped;
    }

    return this.obstacles.pushOut(clamped);
  }

  private clampToMap(position: Position): Position {
    return {
      x: Math.max(MAP_PADDING, Math.min(MAP_WIDTH - MAP_PADDING, position.x)),
      y: Math.max(MAP_PADDING, Math.min(MAP_HEIGHT - MAP_PADDING, position.y)),
    };
  }
}
