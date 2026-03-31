import { BattleGridSummary, BattleObstacle, Position, TileCoord } from '../types';

const OBSTACLE_CLEARANCE = 10;
const TEMPORARY_TILE_PENALTY = 18;
const SQRT2 = Math.SQRT2;

interface PathSearchOptions {
  occupiedTiles?: Iterable<TileCoord | string>;
  reservedTiles?: Iterable<TileCoord | string>;
  goalTiles?: Iterable<TileCoord | string>;
}

interface PathNode {
  tile: TileCoord;
  g: number;
  f: number;
  parent?: string;
}

export class BattleGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly tileWidth: number;
  private readonly tileHeight: number;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly blocked = new Set<string>();
  private readonly summary: BattleGridSummary;

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

    let cost = 0;
    let previous = start;
    for (const tile of path) {
      cost += this.stepCost(previous, tile);
      previous = tile;
    }

    return cost;
  }

  findPath(start: TileCoord, goal: TileCoord, options: PathSearchOptions = {}): TileCoord[] | null {
    const startTile = this.findNearestWalkableTile(start);
    const goalTile = this.findNearestWalkableTile(goal);

    if (this.tilesEqual(startTile, goalTile)) {
      return [];
    }

    const occupied = this.normalizeTileSet(options.occupiedTiles);
    const reserved = this.normalizeTileSet(options.reservedTiles);
    const goalKeys = this.normalizeTileSet(options.goalTiles ?? [goalTile]);
    goalKeys.add(this.tileKey(goalTile));

    const open = new Map<string, PathNode>();
    const closed = new Set<string>();
    const byKey = new Map<string, PathNode>();

    const startKey = this.tileKey(startTile);
    const startNode: PathNode = {
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

        const node: PathNode = {
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

      let cost = 0;
      let previous = start;
      for (const tile of path) {
        cost += this.stepCost(previous, tile);
        previous = tile;
      }

      if (cost < bestCost) {
        bestCost = cost;
        bestPath = path;
      }
    }

    return bestPath;
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
        }
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
    for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
      for (let colOffset = -1; colOffset <= 1; colOffset++) {
        if (rowOffset === 0 && colOffset === 0) {
          continue;
        }

        const candidate = {
          col: tile.col + colOffset,
          row: tile.row + rowOffset,
        };
        if (!this.isInBounds(candidate) || this.isBlocked(candidate)) {
          continue;
        }

        if (rowOffset !== 0 && colOffset !== 0) {
          const sideA = { col: tile.col + colOffset, row: tile.row };
          const sideB = { col: tile.col, row: tile.row + rowOffset };
          if (this.isBlocked(sideA) || this.isBlocked(sideB)) {
            continue;
          }
        }

        neighbors.push(candidate);
      }
    }

    return neighbors;
  }

  private reconstructPath(goalKey: string, nodes: Map<string, PathNode>): TileCoord[] {
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

  private heuristic(a: TileCoord, b: TileCoord): number {
    const dx = Math.abs(a.col - b.col);
    const dy = Math.abs(a.row - b.row);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  }

  private stepCost(a: TileCoord, b: TileCoord): number {
    return a.col !== b.col && a.row !== b.row ? SQRT2 : 1;
  }

  private getLowestScoreNode(open: Map<string, PathNode>): [string, PathNode] | undefined {
    let best: [string, PathNode] | undefined;
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
