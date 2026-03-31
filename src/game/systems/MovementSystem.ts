import { Unit } from '../entities/Unit';
import { TileCoord } from '../types';
import { BattleGrid } from './BattleGrid';
import { ObstacleSystem } from './Obstacles';

interface NavigationState {
  destinationKey?: string;
  waitTime: number;
}

const REPATH_WAIT_SEC = 0.25;
const ENGAGE_LINE_OF_SIGHT_PADDING = 6;

export class MovementSystem {
  private battleGrid: BattleGrid | null = null;
  private obstacles: ObstacleSystem | null = null;
  private navigation = new Map<string, NavigationState>();
  private tileReservations = new Map<string, string>();

  setBattleGrid(battleGrid: BattleGrid): void {
    this.battleGrid = battleGrid;
  }

  setObstacles(obstacles: ObstacleSystem): void {
    this.obstacles = obstacles;
  }

  update(alliedUnits: Unit[], enemyUnits: Unit[], dt: number): void {
    if (!this.battleGrid) {
      return;
    }

    const allUnits = [...alliedUnits, ...enemyUnits];
    const occupiedTiles = new Map<string, string>();
    for (const unit of allUnits) {
      if (!unit.isAlive() || unit.isPassive()) {
        this.releaseReservation(unit);
        continue;
      }

      occupiedTiles.set(this.battleGrid.tileKey(unit.state.tile), unit.id);
    }

    this.moveUnitsTowardTargets(alliedUnits, enemyUnits, occupiedTiles, dt);
    this.moveUnitsTowardTargets(enemyUnits, alliedUnits, occupiedTiles, dt);
    this.pruneNavigation(allUnits);
  }

  private moveUnitsTowardTargets(
    units: Unit[],
    opponents: Unit[],
    occupiedTiles: Map<string, string>,
    dt: number
  ): void {
    if (!this.battleGrid) {
      return;
    }

    for (const unit of units) {
      if (!unit.isAlive() || unit.isPassive()) {
        this.clearMovementState(unit);
        continue;
      }

      if (unit.state.nextTile && unit.state.reservedNextTile) {
        this.progressStep(unit, occupiedTiles, dt);
        continue;
      }

      const destination = this.resolveDestination(unit, opponents, occupiedTiles);
      if (!destination) {
        this.clearMovementState(unit);
        if (unit.state.state === 'moving') {
          unit.setAnimState('idle');
        }
        continue;
      }

      if (this.battleGrid.tilesEqual(unit.state.tile, destination.tile)) {
        unit.state.pathTiles = [];
        if (unit.state.state === 'moving') {
          unit.setAnimState('idle');
        }
        continue;
      }

      this.stepTowardDestination(unit, destination.tile, destination.key, occupiedTiles, dt);
    }
  }

  private resolveDestination(
    unit: Unit,
    opponents: Unit[],
    occupiedTiles: Map<string, string>
  ): { tile: TileCoord; key: string } | null {
    if (!this.battleGrid) {
      return null;
    }

    const fallbackOrderTile = unit.state.orderTile
      ? this.battleGrid.findNearestWalkableTile(unit.state.orderTile)
      : undefined;

    if (!unit.state.targetId) {
      return fallbackOrderTile
        ? { tile: fallbackOrderTile, key: `order:${this.battleGrid.tileKey(fallbackOrderTile)}` }
        : null;
    }

    const target = opponents.find((candidate) => candidate.id === unit.state.targetId);
    if (!target || !target.isAlive()) {
      unit.state.targetId = undefined;
      return fallbackOrderTile
        ? { tile: fallbackOrderTile, key: `order:${this.battleGrid.tileKey(fallbackOrderTile)}` }
        : null;
    }

    if (!this.isPursuitAllowed(unit, target)) {
      unit.state.targetId = undefined;
      return fallbackOrderTile
        ? { tile: fallbackOrderTile, key: `order:${this.battleGrid.tileKey(fallbackOrderTile)}` }
        : null;
    }

    if (this.canEngageTarget(unit, target)) {
      return null;
    }

    const engagementTile = this.findBestEngagementTile(unit, target, occupiedTiles);
    if (engagementTile) {
      return {
        tile: engagementTile,
        key: `engage:${target.id}:${this.battleGrid.tileKey(engagementTile)}`,
      };
    }

    return fallbackOrderTile
      ? { tile: fallbackOrderTile, key: `order:${this.battleGrid.tileKey(fallbackOrderTile)}` }
      : null;
  }

  private stepTowardDestination(
    unit: Unit,
    destinationTile: TileCoord,
    destinationKey: string,
    occupiedTiles: Map<string, string>,
    dt: number
  ): void {
    if (!this.battleGrid) {
      return;
    }

    const navigation = this.getNavigationState(unit.id);
    const reservedKey = unit.state.reservedNextTile
      ? this.battleGrid.tileKey(unit.state.reservedNextTile)
      : undefined;

    if (
      navigation.destinationKey !== destinationKey ||
      !unit.state.pathTiles?.length ||
      (reservedKey &&
        this.tileReservations.get(reservedKey) !== unit.id &&
        !this.battleGrid.tilesEqual(unit.state.reservedNextTile, unit.state.nextTile))
    ) {
      const path = this.battleGrid.findPath(unit.state.tile, destinationTile, {
        occupiedTiles: [...occupiedTiles.entries()]
          .filter(([, ownerId]) => ownerId !== unit.id)
          .map(([key]) => key),
        reservedTiles: [...this.tileReservations.entries()]
          .filter(([, ownerId]) => ownerId !== unit.id)
          .map(([key]) => key),
        goalTiles: [destinationTile],
      });

      unit.state.pathTiles = path ?? [];
      navigation.destinationKey = destinationKey;
      navigation.waitTime = 0;
    }

    const nextTile = unit.state.pathTiles?.[0];
    if (!nextTile) {
      navigation.waitTime += dt;
      if (navigation.waitTime >= REPATH_WAIT_SEC) {
        unit.state.pathTiles = [];
      }
      if (unit.state.state === 'moving') {
        unit.setAnimState('idle');
      }
      return;
    }

    if (!this.tryReserveTile(unit, nextTile, occupiedTiles)) {
      navigation.waitTime += dt;
      if (navigation.waitTime >= REPATH_WAIT_SEC) {
        unit.state.pathTiles = [];
        navigation.destinationKey = undefined;
      }
      if (unit.state.state === 'moving') {
        unit.setAnimState('idle');
      }
      return;
    }

    unit.state.nextTile = { ...nextTile };
    unit.state.reservedNextTile = { ...nextTile };
    unit.state.stepProgress = unit.state.stepProgress ?? 0;
    this.progressStep(unit, occupiedTiles, dt);
  }

  private progressStep(unit: Unit, occupiedTiles: Map<string, string>, dt: number): void {
    if (!this.battleGrid || !unit.state.nextTile) {
      return;
    }

    const originTile = unit.state.tile;
    const targetTile = unit.state.nextTile;
    const origin = this.battleGrid.tileToWorld(originTile);
    const target = this.battleGrid.tileToWorld(targetTile);
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const duration = Math.max(0.05, this.battleGrid.tilePixelWidth / Math.max(1, unit.state.moveSpeed));
    const progress = Math.min(1, (unit.state.stepProgress ?? 0) + dt / duration);

    unit.state.stepProgress = progress;
    unit.updateFacingFromDelta(dx);
    unit.state.position = {
      x: origin.x + dx * progress,
      y: origin.y + dy * progress,
    };
    unit.sprite.setPosition(unit.state.position.x, unit.state.position.y);
    unit.setAnimState('moving');

    if (progress < 1) {
      return;
    }

    const currentKey = this.battleGrid.tileKey(originTile);
    const nextKey = this.battleGrid.tileKey(targetTile);
    occupiedTiles.delete(currentKey);
    occupiedTiles.set(nextKey, unit.id);

    unit.setTilePosition(targetTile, target);
    unit.state.stepProgress = 0;
    unit.state.nextTile = undefined;
    unit.state.reservedNextTile = undefined;
    if (unit.state.pathTiles?.length && this.battleGrid.tilesEqual(unit.state.pathTiles[0], targetTile)) {
      unit.state.pathTiles.shift();
    }
    this.tileReservations.delete(nextKey);
    if (unit.state.pathTiles?.length === 0) {
      unit.state.pathTiles = [];
      unit.setAnimState('idle');
    }
  }

  private tryReserveTile(
    unit: Unit,
    tile: TileCoord,
    occupiedTiles: Map<string, string>
  ): boolean {
    if (!this.battleGrid) {
      return false;
    }

    const key = this.battleGrid.tileKey(tile);
    const occupant = occupiedTiles.get(key);
    if (occupant && occupant !== unit.id) {
      return false;
    }

    const reservedBy = this.tileReservations.get(key);
    if (reservedBy && reservedBy !== unit.id) {
      return false;
    }

    this.tileReservations.set(key, unit.id);
    unit.state.reservedNextTile = { ...tile };
    return true;
  }

  private findBestEngagementTile(
    unit: Unit,
    target: Unit,
    occupiedTiles: Map<string, string>
  ): TileCoord | null {
    if (!this.battleGrid) {
      return null;
    }

    const rangeTiles = this.battleGrid.pixelsToAttackRangeTiles(unit.state.attackRange);
    const candidates: TileCoord[] = [];
    for (let row = target.state.tile.row - rangeTiles; row <= target.state.tile.row + rangeTiles; row++) {
      for (let col = target.state.tile.col - rangeTiles; col <= target.state.tile.col + rangeTiles; col++) {
        const tile = { col, row };
        if (!this.battleGrid.isWalkable(tile)) {
          continue;
        }

        if (!this.battleGrid.isWithinAttackRange(tile, target.state.tile, rangeTiles)) {
          continue;
        }

        const key = this.battleGrid.tileKey(tile);
        const occupant = occupiedTiles.get(key);
        if (occupant && occupant !== unit.id) {
          continue;
        }

        if (
          this.obstacles &&
          !this.obstacles.hasLineOfSight(
            this.battleGrid.tileToWorld(tile),
            target.state.position,
            ENGAGE_LINE_OF_SIGHT_PADDING
          )
        ) {
          continue;
        }

        candidates.push(tile);
      }
    }

    candidates.sort((a, b) => {
      const pathCostA = this.battleGrid!.estimatePathCost(unit.state.tile, a, {
        occupiedTiles: [...occupiedTiles.entries()]
          .filter(([, ownerId]) => ownerId !== unit.id)
          .map(([key]) => key),
        reservedTiles: [...this.tileReservations.entries()]
          .filter(([, ownerId]) => ownerId !== unit.id)
          .map(([key]) => key),
      });
      const pathCostB = this.battleGrid!.estimatePathCost(unit.state.tile, b, {
        occupiedTiles: [...occupiedTiles.entries()]
          .filter(([, ownerId]) => ownerId !== unit.id)
          .map(([key]) => key),
        reservedTiles: [...this.tileReservations.entries()]
          .filter(([, ownerId]) => ownerId !== unit.id)
          .map(([key]) => key),
      });
      if (pathCostA !== pathCostB) {
        return pathCostA - pathCostB;
      }

      return this.battleGrid!.distance(a, target.state.tile) - this.battleGrid!.distance(b, target.state.tile);
    });

    return candidates[0] ?? null;
  }

  private isPursuitAllowed(unit: Unit, target: Unit): boolean {
    if (!this.battleGrid) {
      return true;
    }

    const orderTile = unit.state.orderTile;
    const leashTiles = unit.state.orderLeashTiles;

    if (!orderTile || !leashTiles) {
      return true;
    }

    const targetDistanceFromAnchor = this.battleGrid.distance(orderTile, target.state.tile);
    if (targetDistanceFromAnchor <= leashTiles) {
      return true;
    }

    return this.battleGrid.isWithinAttackRange(
      unit.state.tile,
      target.state.tile,
      this.battleGrid.pixelsToAttackRangeTiles(unit.state.attackRange)
    );
  }

  private canEngageTarget(unit: Unit, target: Unit): boolean {
    if (!this.battleGrid) {
      return false;
    }

    if (
      !this.battleGrid.isWithinAttackRange(
        unit.state.tile,
        target.state.tile,
        this.battleGrid.pixelsToAttackRangeTiles(unit.state.attackRange)
      )
    ) {
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

  private getNavigationState(unitId: string): NavigationState {
    const existing = this.navigation.get(unitId);
    if (existing) {
      return existing;
    }

    const created: NavigationState = {
      waitTime: 0,
    };
    this.navigation.set(unitId, created);
    return created;
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

    for (const [tileKey, ownerId] of this.tileReservations.entries()) {
      if (!activeIds.has(ownerId)) {
        this.tileReservations.delete(tileKey);
      }
    }
  }

  private clearMovementState(unit: Unit): void {
    unit.state.pathTiles = [];
    unit.state.nextTile = undefined;
    unit.state.reservedNextTile = undefined;
    unit.state.stepProgress = 0;
    this.releaseReservation(unit);
    this.navigation.delete(unit.id);
  }

  private releaseReservation(unit: Unit): void {
    if (!this.battleGrid || !unit.state.reservedNextTile) {
      return;
    }

    const key = this.battleGrid.tileKey(unit.state.reservedNextTile);
    if (this.tileReservations.get(key) === unit.id) {
      this.tileReservations.delete(key);
    }
  }
}
