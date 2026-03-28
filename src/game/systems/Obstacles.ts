import { Scene } from 'phaser';
import NavMesh, { buildPolysFromGridMap } from 'navmesh';
import { BattleObstacle, Position } from '../types';

export type Obstacle = BattleObstacle;

export interface ObstacleInitOptions {
  layout?: Obstacle[];
  layoutIndex?: number;
  showLabels?: boolean;
}

export const OBSTACLE_CLEARANCE = 10;

interface GridCell {
  col: number;
  row: number;
}

class MeshPoint {
  constructor(
    public x: number,
    public y: number
  ) {}

  equals(point: { x: number; y: number }): boolean {
    return this.x === point.x && this.y === point.y;
  }

  angle(point: { x: number; y: number }): number {
    return Math.atan2(point.y - this.y, point.x - this.x);
  }

  distance(point: { x: number; y: number }): number {
    return Math.hypot(point.x - this.x, point.y - this.y);
  }

  add(point: { x: number; y: number }): void {
    this.x += point.x;
    this.y += point.y;
  }

  subtract(point: { x: number; y: number }): void {
    this.x -= point.x;
    this.y -= point.y;
  }

  clone(): MeshPoint {
    return new MeshPoint(this.x, this.y);
  }
}

const MAP_WIDTH = 1024;
const MAP_HEIGHT = 768;
const GRID_SIZE = 16;
const PATH_PADDING = OBSTACLE_CLEARANCE;
const SEGMENT_STEP = 8;
const NAVMESH_PROJECTION_LIMIT = GRID_SIZE * 4;
const MIN_WAYPOINT_GAP = 4;
const ROCK_TEXTURES = ['terrain-rock-1', 'terrain-rock-2', 'terrain-rock-3', 'terrain-rock-4'];
const WALL_TEXTURES = ['terrain-rock-3', 'terrain-rock-4'];
const WALL_SPACING = 30;
const ROCK_CELL = 40;

const LAYOUTS: Obstacle[][] = [
  [
    { id: 'wall-top', label: 'Wall', x: 380, y: 90, width: 240, height: 25 },
    { id: 'wall-bot', label: 'Wall', x: 380, y: 560, width: 240, height: 25 },
    { id: 'rock-mid', label: 'Rocks', x: 460, y: 310, width: 80, height: 70 },
  ],
  [
    { id: 'wall-center', label: 'Wall', x: 430, y: 270, width: 140, height: 170 },
    { id: 'rock-top', label: 'Rocks', x: 340, y: 120, width: 55, height: 55 },
    { id: 'rock-bot', label: 'Rocks', x: 340, y: 520, width: 55, height: 55 },
  ],
  [
    { id: 'rock-1', label: 'Rocks', x: 330, y: 190, width: 65, height: 55 },
    { id: 'rock-2', label: 'Rocks', x: 490, y: 380, width: 75, height: 45 },
    { id: 'rock-3', label: 'Rocks', x: 360, y: 500, width: 55, height: 65 },
    { id: 'wall-mid', label: 'Wall', x: 580, y: 260, width: 30, height: 130 },
  ],
];

export class ObstacleSystem {
  private readonly cols = Math.ceil(MAP_WIDTH / GRID_SIZE);
  private readonly rows = Math.ceil(MAP_HEIGHT / GRID_SIZE);
  private obstacles: Obstacle[] = [];
  private blocked: boolean[] = [];
  private navMesh: NavMesh | null = null;
  private visuals: Phaser.GameObjects.GameObject[] = [];
  private labels: Phaser.GameObjects.Text[] = [];

  getObstacles(): Obstacle[] {
    return this.obstacles;
  }

  init(scene: Scene, options: ObstacleInitOptions = {}): void {
    const layout = options.layout
      ? options.layout
      : LAYOUTS[(options.layoutIndex ?? Math.floor(Math.random() * LAYOUTS.length)) % LAYOUTS.length];

    this.configureTextureSampling(scene);
    this.obstacles = layout.map((obstacle) => ({ ...obstacle }));
    this.rebuildGrid();

    for (const obstacle of this.obstacles) {
      this.createObstacleVisual(scene, obstacle);

      if (options.showLabels === false) {
        continue;
      }

      const label = scene.add.text(
        obstacle.x + obstacle.width / 2,
        obstacle.y + obstacle.height / 2,
        obstacle.label,
        {
          fontSize: '11px',
          color: '#f1f4d8',
          fontFamily: '"NeoDunggeunmoPro", monospace',
          stroke: '#162018',
          strokeThickness: 3,
          padding: { x: 2, y: 1 },
        }
      );
      label.setOrigin(0.5);
      label.setResolution(2);
      label.setDepth(2);
      this.labels.push(label);
    }
  }

  isBlocked(pos: Position, padding = PATH_PADDING): boolean {
    if (
      pos.x < padding ||
      pos.x > MAP_WIDTH - padding ||
      pos.y < padding ||
      pos.y > MAP_HEIGHT - padding
    ) {
      return true;
    }

    for (const obstacle of this.obstacles) {
      if (
        pos.x > obstacle.x - padding &&
        pos.x < obstacle.x + obstacle.width + padding &&
        pos.y > obstacle.y - padding &&
        pos.y < obstacle.y + obstacle.height + padding
      ) {
        return true;
      }
    }

    return false;
  }

  hasLineOfSight(from: Position, to: Position, padding = PATH_PADDING): boolean {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / SEGMENT_STEP));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sample = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      };

      if (this.isBlocked(sample, padding)) {
        return false;
      }
    }

    return true;
  }

  pushOut(pos: Position, padding = PATH_PADDING): Position {
    const resolved = {
      x: Phaser.Math.Clamp(pos.x, padding, MAP_WIDTH - padding),
      y: Phaser.Math.Clamp(pos.y, padding, MAP_HEIGHT - padding),
    };

    for (let pass = 0; pass < 4; pass++) {
      let adjusted = false;

      for (const obstacle of this.obstacles) {
        const left = obstacle.x - padding;
        const right = obstacle.x + obstacle.width + padding;
        const top = obstacle.y - padding;
        const bottom = obstacle.y + obstacle.height + padding;

        if (
          resolved.x > left &&
          resolved.x < right &&
          resolved.y > top &&
          resolved.y < bottom
        ) {
          const escapeLeft = resolved.x - left;
          const escapeRight = right - resolved.x;
          const escapeTop = resolved.y - top;
          const escapeBottom = bottom - resolved.y;
          const minEscape = Math.min(escapeLeft, escapeRight, escapeTop, escapeBottom);

          if (minEscape === escapeLeft) {
            resolved.x = left - 1;
          } else if (minEscape === escapeRight) {
            resolved.x = right + 1;
          } else if (minEscape === escapeTop) {
            resolved.y = top - 1;
          } else {
            resolved.y = bottom + 1;
          }

          resolved.x = Phaser.Math.Clamp(resolved.x, padding, MAP_WIDTH - padding);
          resolved.y = Phaser.Math.Clamp(resolved.y, padding, MAP_HEIGHT - padding);
          adjusted = true;
        }
      }

      if (!adjusted) {
        break;
      }
    }

    return resolved;
  }

  findNearestNavigablePoint(pos: Position): Position {
    const meshPoint = this.resolveMeshPoint(pos);
    return meshPoint ?? this.pushOut(pos);
  }

  findPath(from: Position, target: Position): Position[] | null {
    if (this.obstacles.length === 0 || this.hasLineOfSight(from, target)) {
      return null;
    }

    if (!this.navMesh) {
      return null;
    }

    const start = this.resolveMeshPoint(from);
    const goal = this.resolveMeshPoint(target);

    if (!start || !goal) {
      return null;
    }

    const navPath = this.navMesh.findPath(start, goal);
    if (!navPath || navPath.length <= 1) {
      return null;
    }

    const waypoints = this.normalizeNavPath(navPath, from, target);
    return waypoints;
  }

  describe(): string {
    if (this.obstacles.length === 0) {
      return '  Open field, no obstacles.';
    }

    return this.obstacles
      .map(
        (obstacle) =>
          `  - ${obstacle.label} at (${obstacle.x}-${obstacle.x + obstacle.width}, ${obstacle.y}-${obstacle.y + obstacle.height}) blocks movement and creates cover`
      )
      .join('\n');
  }

  destroy(): void {
    for (const visual of this.visuals) {
      visual.destroy();
    }
    for (const label of this.labels) {
      label.destroy();
    }

    this.visuals = [];
    this.labels = [];
    this.obstacles = [];
    this.blocked = [];
    this.navMesh?.destroy();
    this.navMesh = null;
  }

  private rebuildGrid(): void {
    this.blocked = new Array(this.cols * this.rows).fill(false);

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cellLeft = col * GRID_SIZE;
        const cellRight = Math.min(MAP_WIDTH, cellLeft + GRID_SIZE);
        const cellTop = row * GRID_SIZE;
        const cellBottom = Math.min(MAP_HEIGHT, cellTop + GRID_SIZE);

        const isBlocked = this.obstacles.some((obstacle) => {
          const left = obstacle.x - PATH_PADDING;
          const right = obstacle.x + obstacle.width + PATH_PADDING;
          const top = obstacle.y - PATH_PADDING;
          const bottom = obstacle.y + obstacle.height + PATH_PADDING;

          return cellLeft < right && cellRight > left && cellTop < bottom && cellBottom > top;
        });

        this.blocked[this.index(col, row)] = isBlocked;
      }
    }

    this.rebuildNavMesh();
  }

  private rebuildNavMesh(): void {
    this.navMesh?.destroy();

    const walkableMap: boolean[][] = [];
    for (let row = 0; row < this.rows; row++) {
      const walkableRow: boolean[] = [];

      for (let col = 0; col < this.cols; col++) {
        walkableRow.push(!this.blocked[this.index(col, row)]);
      }

      walkableMap.push(walkableRow);
    }

    const meshPolygons = buildPolysFromGridMap(
      walkableMap,
      GRID_SIZE,
      GRID_SIZE,
      (tile) => tile
    );

    this.navMesh = meshPolygons.length > 0 ? new NavMesh(meshPolygons) : null;
  }

  private createObstacleVisual(scene: Scene, obstacle: Obstacle): void {
    const isWall = this.isWallObstacle(obstacle);
    if (isWall) {
      this.createWallVisual(scene, obstacle);
      return;
    }

    this.createRockVisual(scene, obstacle);
  }

  private configureTextureSampling(scene: Scene): void {
    const textureKeys = new Set([...ROCK_TEXTURES, ...WALL_TEXTURES]);
    for (const key of textureKeys) {
      const texture = scene.textures.get(key);
      texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  private createWallVisual(scene: Scene, obstacle: Obstacle): void {
    const centerX = obstacle.x + obstacle.width / 2;
    const centerY = obstacle.y + obstacle.height / 2;
    const horizontal = obstacle.width >= obstacle.height;
    const thickness = horizontal ? obstacle.height : obstacle.width;
    const runLength = horizontal ? obstacle.width : obstacle.height;

    const count = Math.max(1, Math.ceil(runLength / WALL_SPACING));
    const spriteSize = Phaser.Math.Clamp(thickness + 12, 34, 56);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = horizontal ? obstacle.x + t * obstacle.width : centerX;
      const y = horizontal ? centerY : obstacle.y + t * obstacle.height;
      const texture = WALL_TEXTURES[this.hash(`${obstacle.id}-${i}`) % WALL_TEXTURES.length];
      const sprite = scene.add.image(x, y, texture);
      sprite.setDisplaySize(spriteSize, spriteSize);
      sprite.setTint(0x97896c);
      sprite.setAlpha(0.92);
      sprite.setDepth(1.02);
      this.visuals.push(sprite);
    }
  }

  private createRockVisual(scene: Scene, obstacle: Obstacle): void {
    const cols = Math.max(1, Math.ceil(obstacle.width / ROCK_CELL));
    const rows = Math.max(1, Math.ceil(obstacle.height / ROCK_CELL));
    const cellWidth = obstacle.width / cols;
    const cellHeight = obstacle.height / rows;
    const spriteSize = Phaser.Math.Clamp(Math.min(cellWidth, cellHeight) + 16, 28, 50);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const jitterX = ((this.hash(`${obstacle.id}-x-${row}-${col}`) % 100) / 100 - 0.5) * 8;
        const jitterY = ((this.hash(`${obstacle.id}-y-${row}-${col}`) % 100) / 100 - 0.5) * 8;
        const x = obstacle.x + (col + 0.5) * cellWidth + jitterX;
        const y = obstacle.y + (row + 0.5) * cellHeight + jitterY;
        const texture = ROCK_TEXTURES[this.hash(`${obstacle.id}-${row}-${col}`) % ROCK_TEXTURES.length];

        const sprite = scene.add.image(x, y, texture);
        sprite.setDisplaySize(spriteSize, spriteSize);
        sprite.setRotation(((this.hash(`${obstacle.id}-rot-${row}-${col}`) % 11) - 5) * 0.03);
        sprite.setTint(0x9baa8a);
        sprite.setAlpha(0.92);
        sprite.setDepth(1.01);
        this.visuals.push(sprite);
      }
    }
  }

  private resolveMeshPoint(pos: Position): Position | null {
    if (!this.navMesh) {
      return null;
    }

    const origin = this.pushOut(pos);
    const closest = this.navMesh.findClosestMeshPoint(
      new MeshPoint(origin.x, origin.y),
      NAVMESH_PROJECTION_LIMIT
    );
    if (closest.point) {
      return this.clampToBounds(closest.point);
    }

    const fallback = this.findNearestWalkableCell(this.worldToCell(origin));
    return fallback ? this.cellToWorld(fallback) : null;
  }

  private normalizeNavPath(
    navPath: Array<{ x: number; y: number }>,
    from: Position,
    target: Position
  ): Position[] | null {
    const waypoints: Position[] = [];

    for (const point of navPath) {
      const waypoint = this.clampToBounds(point);
      const anchor = waypoints.length > 0 ? waypoints[waypoints.length - 1] : from;

      if (Math.hypot(anchor.x - waypoint.x, anchor.y - waypoint.y) < MIN_WAYPOINT_GAP) {
        continue;
      }

      waypoints.push(waypoint);
    }

    if (waypoints.length === 0) {
      return null;
    }

    const finalWaypoint = waypoints[waypoints.length - 1];
    if (
      Math.hypot(finalWaypoint.x - target.x, finalWaypoint.y - target.y) >= MIN_WAYPOINT_GAP &&
      this.hasLineOfSight(finalWaypoint, target)
    ) {
      waypoints.push(this.pushOut(target));
    }

    return waypoints.length > 0 ? waypoints : null;
  }

  private findNearestWalkableCell(origin: GridCell): GridCell | null {
    if (this.isWalkableCell(origin)) {
      return origin;
    }

    const maxRadius = Math.max(this.cols, this.rows);

    for (let radius = 1; radius <= maxRadius; radius++) {
      let best: GridCell | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let row = origin.row - radius; row <= origin.row + radius; row++) {
        for (let col = origin.col - radius; col <= origin.col + radius; col++) {
          const onPerimeter =
            row === origin.row - radius ||
            row === origin.row + radius ||
            col === origin.col - radius ||
            col === origin.col + radius;

          if (!onPerimeter) {
            continue;
          }

          const candidate = { col, row };
          if (!this.isWalkableCell(candidate)) {
            continue;
          }

          const distance = this.heuristic(origin, candidate);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate;
          }
        }
      }

      if (best) {
        return best;
      }
    }

    return null;
  }

  private isWalkableCell(cell: GridCell): boolean {
    if (
      cell.col < 0 ||
      cell.col >= this.cols ||
      cell.row < 0 ||
      cell.row >= this.rows
    ) {
      return false;
    }

    return !this.blocked[this.index(cell.col, cell.row)];
  }

  private worldToCell(pos: Position): GridCell {
    return {
      col: Phaser.Math.Clamp(Math.floor(pos.x / GRID_SIZE), 0, this.cols - 1),
      row: Phaser.Math.Clamp(Math.floor(pos.y / GRID_SIZE), 0, this.rows - 1),
    };
  }

  private cellToWorld(cell: GridCell): Position {
    return {
      x: Phaser.Math.Clamp(cell.col * GRID_SIZE + GRID_SIZE / 2, PATH_PADDING, MAP_WIDTH - PATH_PADDING),
      y: Phaser.Math.Clamp(cell.row * GRID_SIZE + GRID_SIZE / 2, PATH_PADDING, MAP_HEIGHT - PATH_PADDING),
    };
  }

  private clampToBounds(pos: { x: number; y: number }): Position {
    return {
      x: Phaser.Math.Clamp(pos.x, PATH_PADDING, MAP_WIDTH - PATH_PADDING),
      y: Phaser.Math.Clamp(pos.y, PATH_PADDING, MAP_HEIGHT - PATH_PADDING),
    };
  }

  private index(col: number, row: number): number {
    return row * this.cols + col;
  }

  private heuristic(a: GridCell, b: GridCell): number {
    return Math.hypot(a.col - b.col, a.row - b.row);
  }

  private isWallObstacle(obstacle: Obstacle): boolean {
    const label = `${obstacle.label} ${obstacle.id}`.toLowerCase();
    return label.includes('wall');
  }

  private hash(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }

    return hash;
  }
}
