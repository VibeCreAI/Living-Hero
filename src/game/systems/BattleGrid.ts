import {
  BattleGridSummary,
  BattleObstacle,
  PathfindingBenchmarkResult,
  PathfindingStats,
  Position,
  TileCoord,
} from '../types';

const OBSTACLE_CLEARANCE = 10;
const TEMPORARY_TILE_PENALTY = 18;
const SQRT2 = Math.SQRT2;

interface PathSearchOptions {
  occupiedTiles?: Iterable<TileCoord | string>;
  reservedTiles?: Iterable<TileCoord | string>;
  goalTiles?: Iterable<TileCoord | string>;
}

interface SearchContext {
  startTile: TileCoord;
  goalTile: TileCoord;
  goalKeys: Set<string>;
  occupied: Set<string>;
  reserved: Set<string>;
}

interface AStarNode {
  tile: TileCoord;
  g: number;
  f: number;
  parent?: string;
}

interface JpsNode extends AStarNode {
  incomingDirection?: Direction;
}

interface Direction {
  col: -1 | 0 | 1;
  row: -1 | 0 | 1;
}

const ZERO_PATH_STATS: PathfindingStats = {
  staticJpsHits: 0,
  jpsConflictRejects: 0,
  aStarFallbackCount: 0,
  noPathCount: 0,
};

const ALL_DIRECTIONS: Direction[] = [
  { col: -1, row: -1 },
  { col: 0, row: -1 },
  { col: 1, row: -1 },
  { col: -1, row: 0 },
  { col: 1, row: 0 },
  { col: -1, row: 1 },
  { col: 0, row: 1 },
  { col: 1, row: 1 },
];

export class BattleGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly tileWidth: number;
  private readonly tileHeight: number;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly blocked = new Set<string>();
  private readonly rowBlockers: number[][];
  private readonly colBlockers: number[][];
  private readonly walkableTiles: TileCoord[] = [];
  private readonly summary: BattleGridSummary;
  private readonly pathStats: PathfindingStats = { ...ZERO_PATH_STATS };

  constructor(
    config: Omit<BattleGridSummary, 'blockedTiles' | 'tacticalAnchors'>,
    obstacles: BattleObstacle[]
  ) {
    this.cols = config.cols;
    this.rows = config.rows;
    this.tileWidth = config.tileWidth;
    this.tileHeight = config.tileHeight;
    this.worldWidth = config.worldWidth;
    this.worldHeight = config.worldHeight;
    this.rowBlockers = Array.from({ length: this.rows }, () => []);
    this.colBlockers = Array.from({ length: this.cols }, () => []);

    this.rasterizeObstacles(obstacles);

    const blockedTiles = [...this.blocked].map((key) => this.keyToTile(key));
    const tacticalAnchors = this.buildCardinalAnchors();
    this.summary = {
      ...config,
      blockedTiles,
      tacticalAnchors,
    };
  }

  getSummary(): BattleGridSummary {
    return {
      ...this.summary,
      blockedTiles: this.summary.blockedTiles.map((tile) => ({ ...tile })),
      tacticalAnchors: this.summary.tacticalAnchors.map((anchor) => ({
        ...anchor,
        tile: { ...anchor.tile },
      })),
    };
  }

  getPathfindingStats(): PathfindingStats {
    return { ...this.pathStats };
  }

  benchmarkPathfinding(queryCount: number = 96): PathfindingBenchmarkResult {
    const queries = this.buildBenchmarkQueries(queryCount);
    const savedStats = this.getPathfindingStats();
    let hybridNoPathCount = 0;
    let aStarNoPathCount = 0;
    let mismatchedCostCount = 0;

    const hybridStart = performance.now();
    const hybridCosts: number[] = [];
    for (const query of queries) {
      const hybridPath = this.findPath(query.start, query.goal);
      if (!hybridPath) {
        hybridNoPathCount++;
        hybridCosts.push(Number.POSITIVE_INFINITY);
      } else {
        hybridCosts.push(this.calculatePathCost(query.start, hybridPath));
      }
    }
    const hybridTimeMs = performance.now() - hybridStart;

    this.restorePathfindingStats(savedStats);

    const aStarStart = performance.now();
    for (let index = 0; index < queries.length; index++) {
      const query = queries[index];
      const context = this.createSearchContext(query.start, query.goal);
      const aStarPath = this.findPenaltyAwareAStarPath(
        context.startTile,
        context.goalTile,
        context.goalKeys,
        context.occupied,
        context.reserved
      );
      const aStarCost = aStarPath
        ? this.calculatePathCost(query.start, aStarPath)
        : Number.POSITIVE_INFINITY;
      if (!aStarPath) {
        aStarNoPathCount++;
      }
      if (!this.costsEqual(hybridCosts[index], aStarCost)) {
        mismatchedCostCount++;
      }
    }
    const aStarTimeMs = performance.now() - aStarStart;

    this.restorePathfindingStats(savedStats);

    return {
      queryCount: queries.length,
      hybridTimeMs,
      aStarTimeMs,
      mismatchedCostCount,
      hybridNoPathCount,
      aStarNoPathCount,
    };
  }

  get tileColumns(): number {
    return this.cols;
  }

  get tileRows(): number {
    return this.rows;
  }

  get width(): number {
    return this.worldWidth;
  }

  get height(): number {
    return this.worldHeight;
  }

  get tilePixelWidth(): number {
    return this.tileWidth;
  }

  get tilePixelHeight(): number {
    return this.tileHeight;
  }

  isBlocked(tile: TileCoord): boolean {
    return this.blocked.has(this.tileKey(this.clampTile(tile)));
  }

  isWalkable(tile: TileCoord): boolean {
    const clamped = this.clampTile(tile);
    return this.isInBounds(clamped) && !this.isBlocked(clamped);
  }

  isInBounds(tile: TileCoord): boolean {
    return tile.col >= 0 && tile.col < this.cols && tile.row >= 0 && tile.row < this.rows;
  }

  clampTile(tile: TileCoord): TileCoord {
    return {
      col: Math.max(0, Math.min(this.cols - 1, Math.round(tile.col))),
      row: Math.max(0, Math.min(this.rows - 1, Math.round(tile.row))),
    };
  }

  tileKey(tile: TileCoord): string {
    const clamped = this.clampTile(tile);
    return `${clamped.col}:${clamped.row}`;
  }

  keyToTile(key: string): TileCoord {
    const [col, row] = key.split(':').map(Number);
    return this.clampTile({ col, row });
  }

  tilesEqual(a?: TileCoord, b?: TileCoord): boolean {
    return Boolean(a && b && a.col === b.col && a.row === b.row);
  }

  worldToTile(position: Position): TileCoord {
    return this.clampTile({
      col: Math.floor(position.x / this.tileWidth),
      row: Math.floor(position.y / this.tileHeight),
    });
  }

  tileToWorld(tile: TileCoord): Position {
    const clamped = this.clampTile(tile);
    return {
      x: clamped.col * this.tileWidth + this.tileWidth / 2,
      y: clamped.row * this.tileHeight + this.tileHeight / 2,
    };
  }

  averageWorldToTile(points: Position[]): TileCoord | undefined {
    if (points.length === 0) {
      return undefined;
    }

    let sumX = 0;
    let sumY = 0;
    for (const point of points) {
      sumX += point.x;
      sumY += point.y;
    }

    return this.findNearestWalkableTile(
      this.worldToTile({ x: sumX / points.length, y: sumY / points.length })
    );
  }

  findNearestWalkableTile(tile: TileCoord): TileCoord {
    const origin = this.clampTile(tile);
    if (this.isWalkable(origin)) {
      return origin;
    }

    let best = origin;
    let bestDistance = Number.POSITIVE_INFINITY;
    const maxRadius = Math.max(this.cols, this.rows);

    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let row = origin.row - radius; row <= origin.row + radius; row++) {
        for (let col = origin.col - radius; col <= origin.col + radius; col++) {
          const candidate = { col, row };
          if (!this.isInBounds(candidate) || !this.isWalkable(candidate)) {
            continue;
          }

          const perimeter =
            row === origin.row - radius ||
            row === origin.row + radius ||
            col === origin.col - radius ||
            col === origin.col + radius;
          if (!perimeter) {
            continue;
          }

          const distance = this.distance(origin, candidate);
          if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
          }
        }
      }

      if (bestDistance < Number.POSITIVE_INFINITY) {
        return best;
      }
    }

    return origin;
  }

  pixelsToRadiusTiles(pixels: number): number {
    return Math.max(1, Math.ceil(pixels / this.tileWidth));
  }

  pixelsToAttackRangeTiles(pixels: number): number {
    return Math.max(1, Math.round(pixels / this.tileWidth));
  }

  distance(a: TileCoord, b: TileCoord): number {
    return Math.hypot(a.col - b.col, a.row - b.row);
  }

  chebyshevDistance(a: TileCoord, b: TileCoord): number {
    return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
  }

  isWithinAttackRange(a: TileCoord, b: TileCoord, rangeTiles: number): boolean {
    const normalizedRange = Math.max(1, rangeTiles);
    if (normalizedRange <= 1) {
      return this.chebyshevDistance(a, b) <= normalizedRange;
    }

    return this.distance(a, b) <= normalizedRange;
  }

  estimatePathCost(
    start: TileCoord,
    goal: TileCoord,
    options: PathSearchOptions = {}
  ): number {
    const path = this.findPath(start, goal, options);
    if (!path) {
      return Number.POSITIVE_INFINITY;
    }

    return this.calculatePathCost(start, path);
  }

  findPath(start: TileCoord, goal: TileCoord, options: PathSearchOptions = {}): TileCoord[] | null {
    const context = this.createSearchContext(start, goal, options);
    if (this.tilesEqual(context.startTile, context.goalTile)) {
      return [];
    }

    const hasDynamicPenalties = context.occupied.size > 0 || context.reserved.size > 0;

    const staticPath = this.findStaticJpsPath(
      context.startTile,
      context.goalTile,
      context.goalKeys
    );

    if (!hasDynamicPenalties) {
      if (staticPath) {
        this.pathStats.staticJpsHits++;
        return staticPath;
      }

      this.pathStats.aStarFallbackCount++;
      const fallbackPath = this.findPenaltyAwareAStarPath(
        context.startTile,
        context.goalTile,
        context.goalKeys,
        context.occupied,
        context.reserved
      );
      if (!fallbackPath) {
        this.pathStats.noPathCount++;
      }
      return fallbackPath;
    }

    if (
      staticPath &&
      !this.pathTouchesPenalizedTiles(
        staticPath,
        context.goalKeys,
        context.occupied,
        context.reserved
      )
    ) {
      this.pathStats.staticJpsHits++;
      return staticPath;
    }

    if (staticPath) {
      this.pathStats.jpsConflictRejects++;
    }

    this.pathStats.aStarFallbackCount++;
    const fallbackPath = this.findPenaltyAwareAStarPath(
      context.startTile,
      context.goalTile,
      context.goalKeys,
      context.occupied,
      context.reserved
    );
    if (!fallbackPath) {
      this.pathStats.noPathCount++;
    }
    return fallbackPath;
  }

  findPathToAny(
    start: TileCoord,
    goals: TileCoord[],
    options: PathSearchOptions = {}
  ): TileCoord[] | null {
    if (goals.length === 0) {
      return null;
    }

    let bestPath: TileCoord[] | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const goal of goals) {
      const path = this.findPath(start, goal, {
        ...options,
        goalTiles: [goal],
      });
      if (!path) {
        continue;
      }

      const cost = this.calculatePathCost(start, path);
      if (cost < bestCost) {
        bestCost = cost;
        bestPath = path;
      }
    }

    return bestPath;
  }

  private createSearchContext(
    start: TileCoord,
    goal: TileCoord,
    options: PathSearchOptions = {}
  ): SearchContext {
    const startTile = this.findNearestWalkableTile(start);
    const goalTile = this.findNearestWalkableTile(goal);
    const occupied = this.normalizeTileSet(options.occupiedTiles);
    const reserved = this.normalizeTileSet(options.reservedTiles);
    const goalKeys = this.normalizeTileSet(options.goalTiles ?? [goalTile]);
    goalKeys.add(this.tileKey(goalTile));

    return {
      startTile,
      goalTile,
      goalKeys,
      occupied,
      reserved,
    };
  }

  private findPenaltyAwareAStarPath(
    startTile: TileCoord,
    goalTile: TileCoord,
    goalKeys: Set<string>,
    occupied: Set<string>,
    reserved: Set<string>
  ): TileCoord[] | null {
    const open = new Map<string, AStarNode>();
    const closed = new Set<string>();
    const byKey = new Map<string, AStarNode>();

    const startKey = this.tileKey(startTile);
    const startNode: AStarNode = {
      tile: startTile,
      g: 0,
      f: this.heuristic(startTile, goalTile),
    };
    open.set(startKey, startNode);
    byKey.set(startKey, startNode);

    while (open.size > 0) {
      const currentEntry = this.getLowestScoreNode(open);
      if (!currentEntry) {
        break;
      }

      const [currentKey, current] = currentEntry;
      open.delete(currentKey);

      if (goalKeys.has(currentKey)) {
        return this.reconstructPath(currentKey, byKey).slice(1);
      }

      closed.add(currentKey);

      for (const neighbor of this.getNeighbors(current.tile)) {
        const neighborKey = this.tileKey(neighbor);
        if (closed.has(neighborKey)) {
          continue;
        }

        let stepCost = this.stepCost(current.tile, neighbor);
        if (
          (occupied.has(neighborKey) || reserved.has(neighborKey)) &&
          !goalKeys.has(neighborKey)
        ) {
          stepCost += TEMPORARY_TILE_PENALTY;
        }

        const nextG = current.g + stepCost;
        const known = byKey.get(neighborKey);
        if (known && nextG >= known.g) {
          continue;
        }

        const node: AStarNode = {
          tile: neighbor,
          g: nextG,
          f: nextG + this.heuristic(neighbor, goalTile),
          parent: currentKey,
        };
        byKey.set(neighborKey, node);
        open.set(neighborKey, node);
      }
    }

    return null;
  }

  private findStaticJpsPath(
    startTile: TileCoord,
    goalTile: TileCoord,
    goalKeys: Set<string>
  ): TileCoord[] | null {
    const open = new Map<string, JpsNode>();
    const closed = new Set<string>();
    const byKey = new Map<string, JpsNode>();
    const jumpCache = new Map<string, string | null>();
    const startKey = this.tileKey(startTile);

    const startNode: JpsNode = {
      tile: startTile,
      g: 0,
      f: this.heuristic(startTile, goalTile),
    };
    open.set(startKey, startNode);
    byKey.set(startKey, startNode);

    while (open.size > 0) {
      const currentEntry = this.getLowestScoreNode(open);
      if (!currentEntry) {
        break;
      }

      const [currentKey, current] = currentEntry;
      open.delete(currentKey);
      if (goalKeys.has(currentKey)) {
        const sparsePath = this.reconstructPath(currentKey, byKey);
        return this.expandJumpPath(sparsePath).slice(1);
      }

      closed.add(currentKey);
      const directions = this.getPrunedDirections(current.tile, current.incomingDirection);

      for (const direction of directions) {
        const jumpPoint = this.jump(current.tile, direction, goalKeys, jumpCache);
        if (!jumpPoint) {
          continue;
        }

        const jumpKey = this.tileKey(jumpPoint);
        if (closed.has(jumpKey)) {
          continue;
        }

        const nextG = current.g + this.segmentCost(current.tile, jumpPoint);
        const known = byKey.get(jumpKey);
        if (known && nextG >= known.g) {
          continue;
        }

        const node: JpsNode = {
          tile: jumpPoint,
          g: nextG,
          f: nextG + this.heuristic(jumpPoint, goalTile),
          parent: currentKey,
          incomingDirection: direction,
        };
        byKey.set(jumpKey, node);
        open.set(jumpKey, node);
      }
    }

    return null;
  }

  private jump(
    from: TileCoord,
    direction: Direction,
    goalKeys: Set<string>,
    jumpCache: Map<string, string | null>
  ): TileCoord | null {
    const cacheKey = `${this.tileKey(from)}|${this.directionKey(direction)}`;
    const cached = jumpCache.get(cacheKey);
    if (cached !== undefined) {
      return cached ? this.keyToTile(cached) : null;
    }

    const result =
      direction.col === 0 || direction.row === 0
        ? this.jumpStraight(from, direction, goalKeys)
        : this.jumpDiagonal(from, direction, goalKeys, jumpCache);

    jumpCache.set(cacheKey, result ? this.tileKey(result) : null);
    return result ? { ...result } : null;
  }

  private jumpStraight(
    from: TileCoord,
    direction: Direction,
    goalKeys: Set<string>
  ): TileCoord | null {
    const maxSteps = this.getStraightScanLimit(from, direction);
    if (maxSteps <= 0) {
      return null;
    }

    let current = { ...from };
    for (let step = 0; step < maxSteps; step++) {
      current = this.translate(current, direction);
      const currentKey = this.tileKey(current);
      if (goalKeys.has(currentKey) || this.hasForcedNeighbor(current, direction)) {
        return current;
      }
    }

    return null;
  }

  private jumpDiagonal(
    from: TileCoord,
    direction: Direction,
    goalKeys: Set<string>,
    jumpCache: Map<string, string | null>
  ): TileCoord | null {
    let current = { ...from };
    const horizontal: Direction = { col: direction.col, row: 0 };
    const vertical: Direction = { col: 0, row: direction.row };

    while (this.canStep(current, direction)) {
      current = this.translate(current, direction);
      const currentKey = this.tileKey(current);
      if (goalKeys.has(currentKey) || this.hasForcedNeighbor(current, direction)) {
        return current;
      }

      if (
        this.jump(current, horizontal, goalKeys, jumpCache) ||
        this.jump(current, vertical, goalKeys, jumpCache)
      ) {
        return current;
      }
    }

    return null;
  }

  private getPrunedDirections(
    tile: TileCoord,
    incomingDirection?: Direction
  ): Direction[] {
    if (!incomingDirection) {
      return ALL_DIRECTIONS.filter((direction) => this.canStep(tile, direction));
    }

    const dx = incomingDirection.col;
    const dy = incomingDirection.row;
    const directions = new Map<string, Direction>();

    const addDirection = (direction: Direction) => {
      const key = this.directionKey(direction);
      if (!directions.has(key)) {
        directions.set(key, direction);
      }
    };

    if (dx !== 0 && dy !== 0) {
      if (this.isTileWalkableExact({ col: tile.col + dx, row: tile.row })) {
        addDirection({ col: dx, row: 0 });
      }
      if (this.isTileWalkableExact({ col: tile.col, row: tile.row + dy })) {
        addDirection({ col: 0, row: dy });
      }
      if (this.canStep(tile, { col: dx, row: dy })) {
        addDirection({ col: dx, row: dy });
      }
      if (
        !this.isTileWalkableExact({ col: tile.col - dx, row: tile.row }) &&
        this.isTileWalkableExact({ col: tile.col - dx, row: tile.row + dy })
      ) {
        addDirection({ col: -dx, row: dy });
      }
      if (
        !this.isTileWalkableExact({ col: tile.col, row: tile.row - dy }) &&
        this.isTileWalkableExact({ col: tile.col + dx, row: tile.row - dy })
      ) {
        addDirection({ col: dx, row: -dy });
      }
    } else if (dx !== 0) {
      if (this.canStep(tile, { col: dx, row: 0 })) {
        addDirection({ col: dx, row: 0 });
      }
      if (
        !this.isTileWalkableExact({ col: tile.col, row: tile.row + 1 }) &&
        this.isTileWalkableExact({ col: tile.col + dx, row: tile.row + 1 })
      ) {
        addDirection({ col: dx, row: 1 });
      }
      if (
        !this.isTileWalkableExact({ col: tile.col, row: tile.row - 1 }) &&
        this.isTileWalkableExact({ col: tile.col + dx, row: tile.row - 1 })
      ) {
        addDirection({ col: dx, row: -1 });
      }
    } else {
      if (this.canStep(tile, { col: 0, row: dy })) {
        addDirection({ col: 0, row: dy });
      }
      if (
        !this.isTileWalkableExact({ col: tile.col + 1, row: tile.row }) &&
        this.isTileWalkableExact({ col: tile.col + 1, row: tile.row + dy })
      ) {
        addDirection({ col: 1, row: dy });
      }
      if (
        !this.isTileWalkableExact({ col: tile.col - 1, row: tile.row }) &&
        this.isTileWalkableExact({ col: tile.col - 1, row: tile.row + dy })
      ) {
        addDirection({ col: -1, row: dy });
      }
    }

    return [...directions.values()];
  }

  private hasForcedNeighbor(tile: TileCoord, direction: Direction): boolean {
    const dx = direction.col;
    const dy = direction.row;

    if (dx !== 0 && dy !== 0) {
      return (
        (!this.isTileWalkableExact({ col: tile.col - dx, row: tile.row }) &&
          this.isTileWalkableExact({ col: tile.col - dx, row: tile.row + dy })) ||
        (!this.isTileWalkableExact({ col: tile.col, row: tile.row - dy }) &&
          this.isTileWalkableExact({ col: tile.col + dx, row: tile.row - dy }))
      );
    }

    if (dx !== 0) {
      return (
        (!this.isTileWalkableExact({ col: tile.col, row: tile.row + 1 }) &&
          this.isTileWalkableExact({ col: tile.col + dx, row: tile.row + 1 })) ||
        (!this.isTileWalkableExact({ col: tile.col, row: tile.row - 1 }) &&
          this.isTileWalkableExact({ col: tile.col + dx, row: tile.row - 1 }))
      );
    }

    return (
      (!this.isTileWalkableExact({ col: tile.col + 1, row: tile.row }) &&
        this.isTileWalkableExact({ col: tile.col + 1, row: tile.row + dy })) ||
      (!this.isTileWalkableExact({ col: tile.col - 1, row: tile.row }) &&
        this.isTileWalkableExact({ col: tile.col - 1, row: tile.row + dy }))
    );
  }

  private canStep(from: TileCoord, direction: Direction): boolean {
    const target = this.translate(from, direction);
    if (!this.isTileWalkableExact(target)) {
      return false;
    }

    if (direction.col !== 0 && direction.row !== 0) {
      const sideA = { col: from.col + direction.col, row: from.row };
      const sideB = { col: from.col, row: from.row + direction.row };
      return this.isTileWalkableExact(sideA) && this.isTileWalkableExact(sideB);
    }

    return true;
  }

  private isTileWalkableExact(tile: TileCoord): boolean {
    return this.isInBounds(tile) && !this.blocked.has(`${tile.col}:${tile.row}`);
  }

  private translate(tile: TileCoord, direction: Direction): TileCoord {
    return {
      col: tile.col + direction.col,
      row: tile.row + direction.row,
    };
  }

  private directionKey(direction: Direction): string {
    return `${direction.col}:${direction.row}`;
  }

  private getStraightScanLimit(from: TileCoord, direction: Direction): number {
    if (direction.col > 0) {
      const nextBlocked = this.findFirstGreater(this.rowBlockers[from.row], from.col);
      return (nextBlocked ?? this.cols) - from.col - 1;
    }
    if (direction.col < 0) {
      const previousBlocked = this.findLastLess(this.rowBlockers[from.row], from.col);
      return from.col - (previousBlocked ?? -1) - 1;
    }
    if (direction.row > 0) {
      const nextBlocked = this.findFirstGreater(this.colBlockers[from.col], from.row);
      return (nextBlocked ?? this.rows) - from.row - 1;
    }

    const previousBlocked = this.findLastLess(this.colBlockers[from.col], from.row);
    return from.row - (previousBlocked ?? -1) - 1;
  }

  private findFirstGreater(values: number[], threshold: number): number | undefined {
    let left = 0;
    let right = values.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (values[mid] <= threshold) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return left < values.length ? values[left] : undefined;
  }

  private findLastLess(values: number[], threshold: number): number | undefined {
    let left = 0;
    let right = values.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (values[mid] < threshold) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return left > 0 ? values[left - 1] : undefined;
  }

  private pathTouchesPenalizedTiles(
    path: TileCoord[],
    goalKeys: Set<string>,
    occupied: Set<string>,
    reserved: Set<string>
  ): boolean {
    for (const tile of path) {
      const key = this.tileKey(tile);
      if (!goalKeys.has(key) && (occupied.has(key) || reserved.has(key))) {
        return true;
      }
    }
    return false;
  }

  private calculatePathCost(start: TileCoord, path: TileCoord[]): number {
    let cost = 0;
    let previous = start;
    for (const tile of path) {
      cost += this.stepCost(previous, tile);
      previous = tile;
    }
    return cost;
  }

  private costsEqual(a: number, b: number): boolean {
    if (!Number.isFinite(a) && !Number.isFinite(b)) {
      return true;
    }
    return Math.abs(a - b) < 0.0001;
  }

  private buildBenchmarkQueries(queryCount: number): Array<{ start: TileCoord; goal: TileCoord }> {
    const queries: Array<{ start: TileCoord; goal: TileCoord }> = [];
    if (this.walkableTiles.length < 2) {
      return queries;
    }

    let seed = 0x12345678;
    const nextRandom = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    let attempts = 0;
    while (queries.length < queryCount && attempts < queryCount * 20) {
      attempts++;
      const start = this.walkableTiles[Math.floor(nextRandom() * this.walkableTiles.length)];
      const goal = this.walkableTiles[Math.floor(nextRandom() * this.walkableTiles.length)];
      if (this.tilesEqual(start, goal)) {
        continue;
      }
      queries.push({
        start: { ...start },
        goal: { ...goal },
      });
    }

    return queries;
  }

  private restorePathfindingStats(stats: PathfindingStats): void {
    this.pathStats.staticJpsHits = stats.staticJpsHits;
    this.pathStats.jpsConflictRejects = stats.jpsConflictRejects;
    this.pathStats.aStarFallbackCount = stats.aStarFallbackCount;
    this.pathStats.noPathCount = stats.noPathCount;
  }

  private rasterizeObstacles(obstacles: BattleObstacle[]): void {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const tile = { col, row };
        const center = this.tileToWorld(tile);
        const blocked = obstacles.some((obstacle) => {
          const left = obstacle.x - OBSTACLE_CLEARANCE;
          const right = obstacle.x + obstacle.width + OBSTACLE_CLEARANCE;
          const top = obstacle.y - OBSTACLE_CLEARANCE;
          const bottom = obstacle.y + obstacle.height + OBSTACLE_CLEARANCE;
          return center.x >= left && center.x <= right && center.y >= top && center.y <= bottom;
        });

        if (blocked) {
          this.blocked.add(this.tileKey(tile));
          this.rowBlockers[row].push(col);
          this.colBlockers[col].push(row);
          continue;
        }

        this.walkableTiles.push({ ...tile });
      }
    }
  }

  private buildCardinalAnchors() {
    const anchors = [
      { id: 'center', name: 'Center Field', tile: { col: Math.floor(this.cols / 2), row: Math.floor(this.rows / 2) } },
      { id: 'north', name: 'North Field', tile: { col: Math.floor(this.cols / 2), row: Math.floor(this.rows * 0.18) } },
      { id: 'south', name: 'South Field', tile: { col: Math.floor(this.cols / 2), row: Math.floor(this.rows * 0.82) } },
      { id: 'east', name: 'East Flank', tile: { col: Math.floor(this.cols * 0.82), row: Math.floor(this.rows / 2) } },
      { id: 'west', name: 'West Flank', tile: { col: Math.floor(this.cols * 0.18), row: Math.floor(this.rows / 2) } },
      { id: 'northeast', name: 'North East', tile: { col: Math.floor(this.cols * 0.82), row: Math.floor(this.rows * 0.18) } },
      { id: 'northwest', name: 'North West', tile: { col: Math.floor(this.cols * 0.18), row: Math.floor(this.rows * 0.18) } },
      { id: 'southeast', name: 'South East', tile: { col: Math.floor(this.cols * 0.82), row: Math.floor(this.rows * 0.82) } },
      { id: 'southwest', name: 'South West', tile: { col: Math.floor(this.cols * 0.18), row: Math.floor(this.rows * 0.82) } },
    ];

    return anchors.map((anchor) => ({
      ...anchor,
      tile: this.findNearestWalkableTile(anchor.tile),
    }));
  }

  private getNeighbors(tile: TileCoord): TileCoord[] {
    const neighbors: TileCoord[] = [];
    for (const direction of ALL_DIRECTIONS) {
      if (!this.canStep(tile, direction)) {
        continue;
      }
      neighbors.push(this.translate(tile, direction));
    }
    return neighbors;
  }

  private reconstructPath<T extends { tile: TileCoord; parent?: string }>(
    goalKey: string,
    nodes: Map<string, T>
  ): TileCoord[] {
    const path: TileCoord[] = [];
    let cursor: string | undefined = goalKey;
    while (cursor) {
      const node = nodes.get(cursor);
      if (!node) {
        break;
      }
      path.unshift({ ...node.tile });
      cursor = node.parent;
    }
    return path;
  }

  private expandJumpPath(path: TileCoord[]): TileCoord[] {
    if (path.length <= 1) {
      return path.map((tile) => ({ ...tile }));
    }

    const expanded: TileCoord[] = [{ ...path[0] }];
    for (let index = 1; index < path.length; index++) {
      const previous = path[index - 1];
      const next = path[index];
      const direction: Direction = {
        col: Math.sign(next.col - previous.col) as Direction['col'],
        row: Math.sign(next.row - previous.row) as Direction['row'],
      };

      let cursor = { ...previous };
      while (!this.tilesEqual(cursor, next)) {
        cursor = this.translate(cursor, direction);
        expanded.push({ ...cursor });
      }
    }

    return expanded;
  }

  private heuristic(a: TileCoord, b: TileCoord): number {
    const dx = Math.abs(a.col - b.col);
    const dy = Math.abs(a.row - b.row);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  }

  private stepCost(a: TileCoord, b: TileCoord): number {
    return a.col !== b.col && a.row !== b.row ? SQRT2 : 1;
  }

  private segmentCost(a: TileCoord, b: TileCoord): number {
    const dx = Math.abs(a.col - b.col);
    const dy = Math.abs(a.row - b.row);
    const diagonalSteps = Math.min(dx, dy);
    const straightSteps = Math.max(dx, dy) - diagonalSteps;
    return diagonalSteps * SQRT2 + straightSteps;
  }

  private getLowestScoreNode<T extends { g: number; f: number }>(
    open: Map<string, T>
  ): [string, T] | undefined {
    let best: [string, T] | undefined;
    for (const entry of open.entries()) {
      if (
        !best ||
        entry[1].f < best[1].f ||
        (entry[1].f === best[1].f && entry[1].g < best[1].g)
      ) {
        best = entry;
      }
    }
    return best;
  }

  private normalizeTileSet(tiles?: Iterable<TileCoord | string>): Set<string> {
    const normalized = new Set<string>();
    if (!tiles) {
      return normalized;
    }

    for (const tile of tiles) {
      if (typeof tile === 'string') {
        normalized.add(tile);
      } else {
        normalized.add(this.tileKey(tile));
      }
    }

    return normalized;
  }
}
