import { Unit } from '../entities/Unit';
import { TileCoord, UnitNavigationDebug } from '../types';
import { BattleGrid } from './BattleGrid';
import { ObstacleSystem } from './Obstacles';

interface NavigationState {
  destinationKey?: string;
  destinationTile?: TileCoord;
  lastStepFromKey?: string;
  lastStepToKey?: string;
  reservedPathKeys: string[];
  waitTime: number;
}

const REPATH_WAIT_SEC = 0.25;
const ORDER_REPATH_WAIT_SEC = 0.9;
const ENGAGE_LINE_OF_SIGHT_PADDING = 6;
const ORDER_DESTINATION_HYSTERESIS_TILES = 1.5;
const ORDER_RESERVATION_HORIZON_STEPS = 3;
const ORDER_DETOUR_WAIT_RADIUS_TILES = 4;
const ADVANCE_MOVING_STEP_OUT_TILES = 1;
const ADVANCE_AUTO_ENGAGE_STEP_OUT_TILES = 3;
const ADVANCE_AUTO_ENGAGE_COMMIT_SEC = 0.75;

export class MovementSystem {
  private battleGrid: BattleGrid | null = null;
  private obstacles: ObstacleSystem | null = null;
  private navigation = new Map<string, NavigationState>();
  private tileReservations = new Map<string, string>();
  private currentTimeSec = 0;

  setBattleGrid(battleGrid: BattleGrid): void {
    this.battleGrid = battleGrid;
  }

  setObstacles(obstacles: ObstacleSystem): void {
    this.obstacles = obstacles;
  }

  update(alliedUnits: Unit[], enemyUnits: Unit[], dt: number, timeSec: number = 0): void {
    if (!this.battleGrid) {
      return;
    }

    this.currentTimeSec = timeSec;

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

    const orderedUnits = [...units].sort((a, b) => this.compareMovementPriority(a, b));

    for (const unit of orderedUnits) {
      if (!unit.isAlive() || unit.isPassive()) {
        this.clearMovementState(unit);
        this.updateNavigationDebug(unit, {
          holdReason: 'inactive',
          replanReason: 'inactive',
          desiredDestinationKey: undefined,
          desiredDestinationTile: undefined,
          activeDestinationKey: undefined,
          activeDestinationTile: undefined,
          pathHeadTile: undefined,
        });
        continue;
      }

      if (unit.state.nextTile && unit.state.reservedNextTile) {
        this.progressStep(unit, occupiedTiles, dt);
        continue;
      }

      const destination = this.resolveDestination(unit, opponents, occupiedTiles);
      if (!destination) {
        this.clearMovementState(unit);
        this.updateNavigationDebug(unit, {
          holdReason: unit.state.targetId ? 'engaging_target' : 'no_destination',
          replanReason: undefined,
          desiredDestinationKey: undefined,
          desiredDestinationTile: undefined,
          activeDestinationKey: undefined,
          activeDestinationTile: undefined,
          pathHeadTile: undefined,
        });
        if (unit.state.state === 'moving') {
          unit.setAnimState('idle');
        }
        continue;
      }

      if (this.battleGrid.tilesEqual(unit.state.tile, destination.tile)) {
        unit.state.pathTiles = [];
        this.updateNavigationDebug(unit, {
          desiredDestinationKey: destination.key,
          desiredDestinationTile: destination.tile,
          activeDestinationKey: destination.key,
          activeDestinationTile: destination.tile,
          pathHeadTile: undefined,
          holdReason: 'at_destination',
          replanReason: undefined,
        });
        if (unit.state.state === 'moving') {
          unit.setAnimState('idle');
        }
        continue;
      }

      const stabilizedDestination = this.stabilizeDestination(unit, destination);
      this.stepTowardDestination(
        unit,
        stabilizedDestination.tile,
        stabilizedDestination.key,
        occupiedTiles,
        dt
      );
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

    if (this.shouldPrioritizeOrderMovement(unit, fallbackOrderTile)) {
      unit.state.targetId = undefined;
      return fallbackOrderTile
        ? { tile: fallbackOrderTile, key: `order:${this.battleGrid.tileKey(fallbackOrderTile)}` }
        : null;
    }

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

    if (unit.state.orderMode === 'advance' && !this.hasCombatPriority(unit)) {
      if (!this.hasReachedAdvanceAnchor(unit)) {
        if (this.canEngageTarget(unit, target)) {
          return null;
        }

        const movingEngagementTile = this.findBestEngagementTile(unit, target, occupiedTiles, (tile) =>
          this.canAdvanceMovingStepOut(unit.state.tile, tile)
        );
        if (movingEngagementTile) {
          this.beginAdvanceAutoEngage(unit, target.id);
          return {
            tile: movingEngagementTile,
            key: `engage:${target.id}:${this.battleGrid.tileKey(movingEngagementTile)}`,
          };
        }

        unit.state.targetId = undefined;
        return fallbackOrderTile
          ? { tile: fallbackOrderTile, key: `order:${this.battleGrid.tileKey(fallbackOrderTile)}` }
          : null;
      }

      if (this.canEngageTarget(unit, target)) {
        return null;
      }

      const anchoredEngagementTile = fallbackOrderTile
        ? this.findBestEngagementTile(unit, target, occupiedTiles, (tile) =>
            this.canAdvanceAnchorStepOut(fallbackOrderTile, tile)
          )
        : null;
      if (anchoredEngagementTile) {
        this.beginAdvanceAutoEngage(unit, target.id);
        return {
          tile: anchoredEngagementTile,
          key: `engage:${target.id}:${this.battleGrid.tileKey(anchoredEngagementTile)}`,
        };
      }

      return fallbackOrderTile
        ? { tile: fallbackOrderTile, key: `order:${this.battleGrid.tileKey(fallbackOrderTile)}` }
        : null;
    }

    if (unit.state.orderMode === 'hold') {
      if (this.canEngageTarget(unit, target)) {
        return null;
      }

      const holdEngagementTile = fallbackOrderTile
        ? this.findBestEngagementTile(unit, target, occupiedTiles, (tile) =>
            this.isWithinHoldCounterEnvelope(unit, fallbackOrderTile, tile)
          )
        : null;
      if (holdEngagementTile) {
        return {
          tile: holdEngagementTile,
          key: `engage:${target.id}:${this.battleGrid.tileKey(holdEngagementTile)}`,
        };
      }

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
    const destinationChanged = navigation.destinationKey !== destinationKey;
    const reservedKey = unit.state.reservedNextTile
      ? this.battleGrid.tileKey(unit.state.reservedNextTile)
      : undefined;
    const replanReason = this.describeReplanReason(unit, destinationChanged, reservedKey);

    this.updateNavigationDebug(unit, {
      desiredDestinationKey: destinationKey,
      desiredDestinationTile: destinationTile,
      holdReason: unit.state.nextTile ? 'stepping' : 'routing',
    });

    if (replanReason) {
      this.releasePathReservations(unit);
      const path = this.computePath(unit, destinationTile, occupiedTiles);

      unit.state.pathTiles = path ?? [];
      navigation.destinationKey = destinationKey;
      navigation.destinationTile = { ...destinationTile };
      navigation.waitTime = 0;
      this.updateNavigationDebug(unit, {
        replanReason,
      });
    }

    let nextTile = unit.state.pathTiles?.[0];
    if (!nextTile) {
      this.releasePathReservations(unit);
      navigation.waitTime += dt;
      this.updateNavigationDebug(unit, {
        activeDestinationKey: navigation.destinationKey,
        activeDestinationTile: navigation.destinationTile,
        pathHeadTile: undefined,
        holdReason: 'waiting_for_path',
        waitTimeSec: navigation.waitTime,
      });
      if (navigation.waitTime >= this.getRepathWaitThreshold(destinationKey)) {
        unit.state.pathTiles = [];
      }
      if (unit.state.state === 'moving') {
        unit.setAnimState('idle');
      }
      return;
    }

    if (
      !destinationChanged &&
      this.shouldPreventImmediateBacktrack(unit, navigation, nextTile, destinationKey)
    ) {
      const alternatePath = this.computePath(
        unit,
        destinationTile,
        occupiedTiles,
        navigation.lastStepFromKey ? [navigation.lastStepFromKey] : []
      );
      if (alternatePath?.length) {
        unit.state.pathTiles = alternatePath;
        nextTile = alternatePath[0];
        this.updateNavigationDebug(unit, {
          replanReason: 'prevent_backtrack',
        });
      } else {
        navigation.waitTime += dt;
        this.updateNavigationDebug(unit, {
          activeDestinationKey: navigation.destinationKey,
          activeDestinationTile: navigation.destinationTile,
          pathHeadTile: nextTile,
          holdReason: 'blocked_backtrack',
          replanReason: 'prevent_backtrack',
          waitTimeSec: navigation.waitTime,
        });
        if (navigation.waitTime >= this.getRepathWaitThreshold(destinationKey)) {
          unit.state.pathTiles = [];
        }
        if (unit.state.state === 'moving') {
          unit.setAnimState('idle');
        }
        return;
      }
    }

    if (
      this.shouldWaitInsteadOfDetour(unit, nextTile, destinationTile, destinationKey)
    ) {
      navigation.waitTime += dt;
      this.updateNavigationDebug(unit, {
        activeDestinationKey: navigation.destinationKey,
        activeDestinationTile: navigation.destinationTile,
        pathHeadTile: nextTile,
        holdReason: 'waiting_to_preserve_order_progress',
        replanReason: 'avoid_order_detour',
        waitTimeSec: navigation.waitTime,
      });
      if (navigation.waitTime >= this.getRepathWaitThreshold(destinationKey)) {
        unit.state.pathTiles = [];
      }
      if (unit.state.state === 'moving') {
        unit.setAnimState('idle');
      }
      return;
    }

    if (!this.tryReserveTile(unit, nextTile, occupiedTiles, true)) {
      navigation.waitTime += dt;
      this.updateNavigationDebug(unit, {
        activeDestinationKey: navigation.destinationKey,
        activeDestinationTile: navigation.destinationTile,
        pathHeadTile: nextTile,
        holdReason: 'reservation_blocked',
        replanReason: 'reserve_next_tile_failed',
        waitTimeSec: navigation.waitTime,
      });
      if (navigation.waitTime >= this.getRepathWaitThreshold(destinationKey)) {
        this.releasePathReservations(unit);
        unit.state.pathTiles = [];
        navigation.destinationKey = undefined;
        navigation.destinationTile = undefined;
      }
      if (unit.state.state === 'moving') {
        unit.setAnimState('idle');
      }
      return;
    }

    navigation.waitTime = 0;
    this.syncPathReservations(unit, occupiedTiles, destinationKey);
    unit.state.nextTile = { ...nextTile };
    unit.state.reservedNextTile = { ...nextTile };
    unit.state.stepProgress = unit.state.stepProgress ?? 0;
    this.updateNavigationDebug(unit, {
      activeDestinationKey: navigation.destinationKey,
      activeDestinationTile: navigation.destinationTile,
      pathHeadTile: nextTile,
      holdReason: 'moving',
      waitTimeSec: 0,
    });
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
      const navigation = this.getNavigationState(unit.id);
      this.updateNavigationDebug(unit, {
        activeDestinationKey: navigation.destinationKey,
        activeDestinationTile: navigation.destinationTile,
        pathHeadTile: targetTile,
        holdReason: 'stepping',
      });
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
    const navigation = this.getNavigationState(unit.id);
    navigation.lastStepFromKey = currentKey;
    navigation.lastStepToKey = nextKey;
    navigation.reservedPathKeys = navigation.reservedPathKeys.filter((key) => key !== nextKey);
    this.updateNavigationDebug(unit, {
      lastStepFrom: this.battleGrid.keyToTile(currentKey),
      lastStepTo: this.battleGrid.keyToTile(nextKey),
      pathHeadTile: unit.state.pathTiles?.[0],
      holdReason: unit.state.pathTiles?.length ? 'moving' : 'idle_after_step',
    });
    if (unit.state.pathTiles?.length === 0) {
      this.releasePathReservations(unit);
      unit.state.pathTiles = [];
      unit.setAnimState('idle');
    }
  }

  private tryReserveTile(
    unit: Unit,
    tile: TileCoord,
    occupiedTiles: Map<string, string>,
    markAsNextTile = false
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
    if (markAsNextTile) {
      unit.state.reservedNextTile = { ...tile };
    }
    return true;
  }

  private syncPathReservations(
    unit: Unit,
    occupiedTiles: Map<string, string>,
    destinationKey: string
  ): void {
    if (!this.battleGrid) {
      return;
    }

    const navigation = this.getNavigationState(unit.id);
    const horizon = this.getReservationHorizon(destinationKey);
    const desiredTiles = unit.state.pathTiles?.slice(0, horizon) ?? [];
    const desiredKeys = desiredTiles.map((tile) => this.battleGrid!.tileKey(tile));
    const keep = new Set(desiredKeys);

    for (const reservedKey of navigation.reservedPathKeys) {
      if (keep.has(reservedKey)) {
        continue;
      }

      if (this.tileReservations.get(reservedKey) === unit.id) {
        this.tileReservations.delete(reservedKey);
      }
    }

    for (const tile of desiredTiles) {
      const key = this.battleGrid.tileKey(tile);
      if (this.tileReservations.get(key) === unit.id) {
        continue;
      }

      if (!this.tryReserveTile(unit, tile, occupiedTiles, false)) {
        break;
      }
    }

    navigation.reservedPathKeys = desiredKeys.filter((key) => this.tileReservations.get(key) === unit.id);
  }

  private computePath(
    unit: Unit,
    destinationTile: TileCoord,
    occupiedTiles: Map<string, string>,
    extraReservedKeys: string[] = []
  ): TileCoord[] | null {
    if (!this.battleGrid) {
      return null;
    }

    return this.battleGrid.findPath(unit.state.tile, destinationTile, {
      occupiedTiles: [...occupiedTiles.entries()]
        .filter(([, ownerId]) => ownerId !== unit.id)
        .map(([key]) => key),
      reservedTiles: [
        ...new Set(
          [
            ...[...this.tileReservations.entries()]
              .filter(([, ownerId]) => ownerId !== unit.id)
              .map(([key]) => key),
            ...extraReservedKeys,
          ]
        ),
      ],
      goalTiles: [destinationTile],
    });
  }

  private findBestEngagementTile(
    unit: Unit,
    target: Unit,
    occupiedTiles: Map<string, string>,
    tileFilter?: (tile: TileCoord) => boolean
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

        if (tileFilter && !tileFilter(tile)) {
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

  private shouldPrioritizeOrderMovement(
    unit: Unit,
    fallbackOrderTile: TileCoord | undefined
  ): boolean {
    if (!fallbackOrderTile) {
      return false;
    }

    if (unit.state.orderMode === 'retreat') {
      return true;
    }

    if (unit.state.orderMode !== 'advance') {
      return false;
    }

    // Let advance orders keep using the tuned nearby-engagement rules when
    // targeting has already identified a valid enemy. Otherwise the early
    // order-move shortcut suppresses the later engage/step-out logic.
    return !this.hasCombatPriority(unit) && !unit.state.targetId;
  }

  private hasCombatPriority(unit: Unit): boolean {
    if (unit.state.orderMode === 'retreat') {
      return false;
    }

    return (unit.state.combatLockUntilSec ?? -1) > this.currentTimeSec;
  }

  private canAdvanceAnchorStepOut(anchorTile: TileCoord, engagementTile: TileCoord): boolean {
    if (!this.battleGrid) {
      return false;
    }

    return (
      this.battleGrid.distance(anchorTile, engagementTile) <= ADVANCE_AUTO_ENGAGE_STEP_OUT_TILES
    );
  }

  private canAdvanceMovingStepOut(originTile: TileCoord, engagementTile: TileCoord): boolean {
    if (!this.battleGrid) {
      return false;
    }

    return (
      this.battleGrid.distance(originTile, engagementTile) <= ADVANCE_MOVING_STEP_OUT_TILES
    );
  }

  private isWithinHoldCounterEnvelope(
    unit: Unit,
    anchorTile: TileCoord,
    engagementTile: TileCoord
  ): boolean {
    if (!this.battleGrid) {
      return false;
    }

    const leashTiles = unit.state.orderLeashTiles ?? unit.state.orderRadiusTiles ?? 0;
    return this.battleGrid.distance(anchorTile, engagementTile) <= leashTiles;
  }

  private beginAdvanceAutoEngage(unit: Unit, targetId: string): void {
    unit.state.combatLockUntilSec = Math.max(
      unit.state.combatLockUntilSec ?? 0,
      this.currentTimeSec + ADVANCE_AUTO_ENGAGE_COMMIT_SEC
    );
    unit.state.combatLockTargetId = targetId;
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

  private getNavigationState(unitId: string): NavigationState {
    const existing = this.navigation.get(unitId);
    if (existing) {
      return existing;
    }

    const created: NavigationState = {
      reservedPathKeys: [],
      waitTime: 0,
    };
    this.navigation.set(unitId, created);
    return created;
  }

  private describeReplanReason(
    unit: Unit,
    destinationChanged: boolean,
    reservedKey: string | undefined
  ): string | undefined {
    if (!this.battleGrid) {
      return undefined;
    }

    if (destinationChanged) {
      return 'destination_changed';
    }

    if (!unit.state.pathTiles?.length) {
      return 'path_missing';
    }

    if (
      reservedKey &&
      this.tileReservations.get(reservedKey) !== unit.id &&
      !this.battleGrid.tilesEqual(unit.state.reservedNextTile, unit.state.nextTile)
    ) {
      return 'reservation_lost';
    }

    return undefined;
  }

  private shouldPreventImmediateBacktrack(
    unit: Unit,
    navigation: NavigationState,
    nextTile: TileCoord,
    destinationKey: string
  ): boolean {
    if (!this.battleGrid) {
      return false;
    }

    if (!destinationKey.startsWith('order:') || unit.state.targetId) {
      return false;
    }

    const currentKey = this.battleGrid.tileKey(unit.state.tile);
    const nextKey = this.battleGrid.tileKey(nextTile);
    return (
      Boolean(navigation.lastStepFromKey) &&
      navigation.lastStepToKey === currentKey &&
      navigation.lastStepFromKey === nextKey
    );
  }

  private shouldWaitInsteadOfDetour(
    unit: Unit,
    nextTile: TileCoord,
    destinationTile: TileCoord,
    destinationKey: string
  ): boolean {
    if (!this.battleGrid) {
      return false;
    }

    if (!destinationKey.startsWith('order:') || unit.state.targetId) {
      return false;
    }

    const currentDistance = this.battleGrid.distance(unit.state.tile, destinationTile);
    if (currentDistance > ORDER_DETOUR_WAIT_RADIUS_TILES) {
      return false;
    }

    const nextDistance = this.battleGrid.distance(nextTile, destinationTile);
    return nextDistance > currentDistance;
  }

  private compareMovementPriority(a: Unit, b: Unit): number {
    const priorityA = this.getMovementPriority(a);
    const priorityB = this.getMovementPriority(b);
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    return a.id.localeCompare(b.id);
  }

  private getMovementPriority(unit: Unit): number {
    if (unit.state.role === 'hero') {
      return 0;
    }

    if (unit.state.role === 'warrior') {
      return 1;
    }

    return 2;
  }

  private getRepathWaitThreshold(destinationKey: string): number {
    return destinationKey.startsWith('order:') ? ORDER_REPATH_WAIT_SEC : REPATH_WAIT_SEC;
  }

  private getReservationHorizon(destinationKey: string): number {
    return destinationKey.startsWith('order:') ? ORDER_RESERVATION_HORIZON_STEPS : 1;
  }

  private stabilizeDestination(
    unit: Unit,
    destination: { tile: TileCoord; key: string }
  ): { tile: TileCoord; key: string } {
    if (!this.battleGrid) {
      return destination;
    }

    const navigation = this.getNavigationState(unit.id);
    if (
      !navigation.destinationTile ||
      !navigation.destinationKey ||
      !navigation.destinationKey.startsWith('order:') ||
      !destination.key.startsWith('order:')
    ) {
      return destination;
    }

    if (
      this.battleGrid.distance(navigation.destinationTile, destination.tile) <=
        ORDER_DESTINATION_HYSTERESIS_TILES &&
      !this.battleGrid.tilesEqual(unit.state.tile, navigation.destinationTile)
    ) {
      return {
        tile: { ...navigation.destinationTile },
        key: navigation.destinationKey,
      };
    }

    return destination;
  }

  private pruneNavigation(units: Unit[]): void {
    const activeIds = new Set(
      units.filter((unit) => unit.isAlive() && !unit.isPassive()).map((unit) => unit.id)
    );

    for (const [unitId, navigation] of this.navigation.entries()) {
      if (!activeIds.has(unitId)) {
        for (const reservedKey of navigation.reservedPathKeys) {
          if (this.tileReservations.get(reservedKey) === unitId) {
            this.tileReservations.delete(reservedKey);
          }
        }
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
    this.releaseAllReservations(unit);
    this.navigation.delete(unit.id);
  }

  private releasePathReservations(unit: Unit): void {
    const navigation = this.navigation.get(unit.id);
    if (!navigation) {
      return;
    }

    for (const reservedKey of navigation.reservedPathKeys) {
      if (this.tileReservations.get(reservedKey) === unit.id) {
        this.tileReservations.delete(reservedKey);
      }
    }
    navigation.reservedPathKeys = [];
  }

  private releaseAllReservations(unit: Unit): void {
    this.releaseReservation(unit);
    this.releasePathReservations(unit);
  }

  private updateNavigationDebug(
    unit: Unit,
    patch: Partial<UnitNavigationDebug>
  ): void {
    const navigation = this.navigation.get(unit.id);
    const nextDebug: UnitNavigationDebug = {
      ...unit.state.navigationDebug,
      ...patch,
    };

    if ('desiredDestinationTile' in patch) {
      nextDebug.desiredDestinationTile = patch.desiredDestinationTile
        ? { ...patch.desiredDestinationTile }
        : undefined;
    }

    if ('activeDestinationTile' in patch) {
      nextDebug.activeDestinationTile = patch.activeDestinationTile
        ? { ...patch.activeDestinationTile }
        : undefined;
    }

    if ('pathHeadTile' in patch) {
      nextDebug.pathHeadTile = patch.pathHeadTile ? { ...patch.pathHeadTile } : undefined;
    }

    if ('lastStepFrom' in patch) {
      nextDebug.lastStepFrom = patch.lastStepFrom ? { ...patch.lastStepFrom } : undefined;
    }

    if ('lastStepTo' in patch) {
      nextDebug.lastStepTo = patch.lastStepTo ? { ...patch.lastStepTo } : undefined;
    }

    nextDebug.reservedPathKeys = navigation
      ? [...navigation.reservedPathKeys]
      : unit.state.navigationDebug?.reservedPathKeys
        ? [...unit.state.navigationDebug.reservedPathKeys]
        : undefined;
    nextDebug.waitTimeSec = patch.waitTimeSec ?? navigation?.waitTime ?? nextDebug.waitTimeSec;

    unit.state.navigationDebug = nextDebug;
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
