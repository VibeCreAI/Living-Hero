import { Unit } from '../entities/Unit';
import { TileCoord } from '../types';
import { BattleGrid } from './BattleGrid';
import { ObstacleSystem } from './Obstacles';

const HOLD_ENGAGE_BUFFER_TILES = 1;
const ROLE_PREFERENCE_BONUS = 3;
const ENGAGE_LINE_OF_SIGHT_PADDING = 6;
const ADVANCE_AUTO_ENGAGE_STEP_OUT_TILES = 3;

export class TargetingSystem {
  private battleGrid: BattleGrid | null = null;
  private obstacles: ObstacleSystem | null = null;
  private timeSec: number = 0;

  setBattleGrid(battleGrid: BattleGrid): void {
    this.battleGrid = battleGrid;
  }

  setObstacles(obstacles: ObstacleSystem): void {
    this.obstacles = obstacles;
  }

  update(alliedUnits: Unit[], enemyUnits: Unit[], timeSec: number = 0): void {
    this.timeSec = timeSec;
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
            this.shouldMaintainCombatTarget(unit, currentTarget) ||
            this.isTargetAllowed(unit, currentTarget) ||
            (this.shouldAllowOpportunityTargeting(unit) &&
              this.isOpportunityTarget(unit, currentTarget))
          ) {
            continue;
          }
        }
        unit.state.targetId = undefined;
      }

      if (obeyOrders) {
        const combatPriorityTarget = this.getCombatPriorityTarget(unit, aliveOpponents);
        if (combatPriorityTarget) {
          unit.state.targetId = combatPriorityTarget.id;
          continue;
        }

        const orderedTarget = this.getOrderedTarget(unit, aliveOpponents);
        if (orderedTarget) {
          unit.state.targetId = orderedTarget.id;
          continue;
        }

        if (this.shouldAllowOpportunityTargeting(unit)) {
          const opportunityTarget = this.getOpportunityTarget(unit, aliveOpponents);
          if (opportunityTarget) {
            unit.state.targetId = opportunityTarget.id;
            continue;
          }
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
      if (!this.hasCombatPriority(unit)) {
        if (!this.hasReachedAdvanceAnchor(unit)) {
          return undefined;
        }

        return this.findBestTarget(unit, opponents, (opponent) =>
          this.canAdvanceAnchorAutoEngage(unit, opponent)
        );
      }

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
    return (
      unit.state.orderMode === 'hold' ||
      unit.state.orderMode === 'protect' ||
      unit.state.orderMode === 'retreat' ||
      (unit.state.orderMode === 'advance' && !this.hasCombatPriority(unit))
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
        (this.shouldAllowOpportunityTargeting(unit) && this.isOpportunityTarget(unit, target)) ||
        (orderTile
          ? this.distance(orderTile, target.state.tile) <= orderRadiusTiles &&
            this.isWithinPursuitEnvelope(unit, target)
          : false)
      );
    }

    if (orderMode === 'advance') {
      if (!this.hasCombatPriority(unit)) {
        return this.hasReachedAdvanceAnchor(unit) && this.canAdvanceAnchorAutoEngage(unit, target);
      }

      return (
        (this.shouldAllowOpportunityTargeting(unit) && this.isOpportunityTarget(unit, target)) ||
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
    if (!this.battleGrid || unit.state.orderMode !== 'advance') {
      return true;
    }

    const orderTile = unit.state.orderTile;
    if (!orderTile) {
      return true;
    }

    const anchorTile = this.battleGrid.findNearestWalkableTile(orderTile);
    return this.battleGrid.tilesEqual(unit.state.tile, anchorTile);
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

  private getCombatPriorityTarget(unit: Unit, opponents: Unit[]): Unit | undefined {
    if (!this.hasCombatPriority(unit)) {
      return undefined;
    }

    const preferredIds = [
      unit.state.targetId,
      unit.state.combatLockTargetId,
      unit.state.lastDamagedById,
    ];

    for (const targetId of preferredIds) {
      if (!targetId) {
        continue;
      }

      const target = opponents.find((opponent) => opponent.id === targetId);
      if (!target) {
        continue;
      }

      if (this.isOpportunityTarget(unit, target) || this.isWithinPursuitEnvelope(unit, target)) {
        return target;
      }
    }

    return this.getOpportunityTarget(unit, opponents);
  }

  private shouldMaintainCombatTarget(unit: Unit, target: Unit): boolean {
    if (!this.hasCombatPriority(unit)) {
      return false;
    }

    if (unit.state.orderMode === 'retreat') {
      return false;
    }

    const lockedTargetId = unit.state.combatLockTargetId ?? unit.state.lastDamagedById;
    if (lockedTargetId && target.id !== lockedTargetId && target.id !== unit.state.targetId) {
      return false;
    }

    return this.isOpportunityTarget(unit, target) || this.isWithinPursuitEnvelope(unit, target);
  }

  private shouldAllowOpportunityTargeting(unit: Unit): boolean {
    if (unit.state.orderMode === 'retreat') {
      return false;
    }

    if (unit.state.orderMode === 'advance') {
      return this.hasCombatPriority(unit);
    }

    return true;
  }

  private hasCombatPriority(unit: Unit): boolean {
    if (unit.state.orderMode === 'retreat') {
      return false;
    }

    return (unit.state.combatLockUntilSec ?? -1) > this.timeSec;
  }

  private canAdvanceAnchorAutoEngage(unit: Unit, target: Unit): boolean {
    if (!this.battleGrid || unit.state.orderMode !== 'advance') {
      return false;
    }

    const orderTile = unit.state.orderTile;
    if (!orderTile) {
      return false;
    }

    if (!this.isWithinPursuitEnvelope(unit, target)) {
      return false;
    }

    if (this.isOpportunityTarget(unit, target)) {
      return true;
    }

    const anchorTile = this.battleGrid.findNearestWalkableTile(orderTile);
    const anchorAttackReach =
      this.attackRangeTiles(unit) + ADVANCE_AUTO_ENGAGE_STEP_OUT_TILES;
    return this.battleGrid.isWithinAttackRange(anchorTile, target.state.tile, anchorAttackReach);
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
