import { Unit } from '../entities/Unit';
import { TileCoord } from '../types';
import { BattleGrid } from './BattleGrid';
import { ObstacleSystem } from './Obstacles';

const HOLD_ENGAGE_BUFFER_TILES = 1;
const ROLE_PREFERENCE_BONUS = 3;
const ADVANCE_ARRIVAL_BUFFER_TILES = 1;
const ADVANCE_ARRIVAL_RADIUS_FACTOR = 0.45;
const ENGAGE_LINE_OF_SIGHT_PADDING = 6;

export class TargetingSystem {
  private battleGrid: BattleGrid | null = null;
  private obstacles: ObstacleSystem | null = null;

  setBattleGrid(battleGrid: BattleGrid): void {
    this.battleGrid = battleGrid;
  }

  setObstacles(obstacles: ObstacleSystem): void {
    this.obstacles = obstacles;
  }

  update(alliedUnits: Unit[], enemyUnits: Unit[]): void {
    this.assignTargets(alliedUnits, enemyUnits, true);
    this.assignTargets(enemyUnits, alliedUnits, false);
  }

  private assignTargets(units: Unit[], opponents: Unit[], obeyOrders: boolean): void {
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
          if (
            !obeyOrders ||
            this.isTargetAllowed(unit, currentTarget) ||
            this.isOpportunityTarget(unit, currentTarget)
          ) {
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

        const opportunityTarget = this.getOpportunityTarget(unit, aliveOpponents);
        if (opportunityTarget) {
          unit.state.targetId = opportunityTarget.id;
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
    const orderTile = unit.state.orderTile;
    const orderRadiusTiles = unit.state.orderRadiusTiles ?? 0;

    if (orderMode === 'focus' && orderTargetId) {
      const focusTarget = opponents.find((opponent) => opponent.id === orderTargetId);
      if (focusTarget && this.isWithinPursuitEnvelope(unit, focusTarget)) {
        return focusTarget;
      }
    }

    if (orderMode === 'hold') {
      return this.findBestTarget(unit, opponents, (opponent) => {
        const withinWeaponReach = this.isWithinAttackReach(unit, opponent, HOLD_ENGAGE_BUFFER_TILES);
        const withinHoldZone = orderTile
          ? this.distance(orderTile, opponent.state.tile) <= orderRadiusTiles
          : false;
        return withinWeaponReach || withinHoldZone;
      });
    }

    if (orderMode === 'protect') {
      return this.findBestTarget(unit, opponents, (opponent) =>
        orderTile
          ? this.distance(orderTile, opponent.state.tile) <= orderRadiusTiles &&
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

      const opportunityTarget = this.getOpportunityTarget(unit, opponents);
      if (opportunityTarget) {
        return opportunityTarget;
      }

      if (!this.hasReachedAdvanceAnchor(unit)) {
        return undefined;
      }

      return this.findBestTarget(unit, opponents, (opponent) =>
        this.isWithinPursuitEnvelope(unit, opponent)
      );
    }

    return undefined;
  }

  private shouldSuppressDefaultTargeting(unit: Unit): boolean {
    return (
      unit.state.orderMode === 'hold' ||
      unit.state.orderMode === 'protect' ||
      unit.state.orderMode === 'retreat' ||
      (unit.state.orderMode === 'advance' &&
        !unit.state.orderTargetId &&
        !this.hasReachedAdvanceAnchor(unit))
    );
  }

  private isTargetAllowed(unit: Unit, target: Unit): boolean {
    const orderMode = unit.state.orderMode;
    const orderTile = unit.state.orderTile;
    const orderRadiusTiles = unit.state.orderRadiusTiles ?? 0;

    if (orderMode === 'focus') {
      return (
        (target.id === unit.state.orderTargetId && this.isWithinPursuitEnvelope(unit, target)) ||
        this.isOpportunityTarget(unit, target)
      );
    }

    if (orderMode === 'retreat') {
      return false;
    }

    if (orderMode === 'hold') {
      return (
        this.isWithinAttackReach(unit, target, HOLD_ENGAGE_BUFFER_TILES) ||
        (orderTile ? this.distance(orderTile, target.state.tile) <= orderRadiusTiles : false)
      );
    }

    if (orderMode === 'protect') {
      return (
        this.isOpportunityTarget(unit, target) ||
        (orderTile
          ? this.distance(orderTile, target.state.tile) <= orderRadiusTiles &&
            this.isWithinPursuitEnvelope(unit, target)
          : false)
      );
    }

    if (orderMode === 'advance') {
      return (
        this.isOpportunityTarget(unit, target) ||
        ((Boolean(unit.state.orderTargetId) || this.hasReachedAdvanceAnchor(unit)) &&
          this.isWithinPursuitEnvelope(unit, target))
      );
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

      const distance = this.distance(unit.state.tile, opponent.state.tile);
      const score =
        distance - (preferredRole && opponent.state.role === preferredRole ? ROLE_PREFERENCE_BONUS : 0);
      if (score < bestScore) {
        bestScore = score;
        best = opponent;
      }
    }

    return best;
  }

  private isWithinPursuitEnvelope(unit: Unit, target: Unit): boolean {
    const orderTile = unit.state.orderTile;
    const leashTiles = unit.state.orderLeashTiles;

    if (!orderTile || !leashTiles) {
      return true;
    }

    const targetDistanceFromAnchor = this.distance(orderTile, target.state.tile);
    if (targetDistanceFromAnchor <= leashTiles) {
      return true;
    }

    return this.isWithinAttackReach(unit, target, HOLD_ENGAGE_BUFFER_TILES);
  }

  private hasReachedAdvanceAnchor(unit: Unit): boolean {
    if (unit.state.orderMode !== 'advance') {
      return true;
    }

    const orderTile = unit.state.orderTile;
    if (!orderTile) {
      return true;
    }

    const orderRadiusTiles = unit.state.orderRadiusTiles ?? 0;
    const arrivalRadius = Math.max(
      ADVANCE_ARRIVAL_BUFFER_TILES,
      Math.ceil(orderRadiusTiles * ADVANCE_ARRIVAL_RADIUS_FACTOR)
    );
    return this.distance(unit.state.tile, orderTile) <= arrivalRadius;
  }

  private attackRangeTiles(unit: Unit): number {
    if (!this.battleGrid) {
      return 1;
    }
    return this.battleGrid.pixelsToAttackRangeTiles(unit.state.attackRange);
  }

  private getOpportunityTarget(unit: Unit, opponents: Unit[]): Unit | undefined {
    if (unit.state.orderMode === 'retreat') {
      return undefined;
    }

    return this.findBestTarget(unit, opponents, (opponent) => this.isOpportunityTarget(unit, opponent));
  }

  private isOpportunityTarget(unit: Unit, target: Unit): boolean {
    return this.isWithinAttackReach(unit, target) && this.hasLineOfSight(unit, target);
  }

  private isWithinAttackReach(unit: Unit, target: Unit, extraTiles = 0): boolean {
    const rangeTiles = this.attackRangeTiles(unit) + extraTiles;
    if (this.battleGrid) {
      return this.battleGrid.isWithinAttackRange(unit.state.tile, target.state.tile, rangeTiles);
    }

    const colDelta = Math.abs(unit.state.tile.col - target.state.tile.col);
    const rowDelta = Math.abs(unit.state.tile.row - target.state.tile.row);
    if (rangeTiles <= 1) {
      return Math.max(colDelta, rowDelta) <= rangeTiles;
    }

    return Math.hypot(colDelta, rowDelta) <= rangeTiles;
  }

  private hasLineOfSight(unit: Unit, target: Unit): boolean {
    if (!this.obstacles) {
      return true;
    }

    return this.obstacles.hasLineOfSight(
      unit.state.position,
      target.state.position,
      ENGAGE_LINE_OF_SIGHT_PADDING
    );
  }

  private distance(a: TileCoord, b: TileCoord): number {
    if (!this.battleGrid) {
      return Math.hypot(a.col - b.col, a.row - b.row);
    }
    return this.battleGrid.distance(a, b);
  }
}
