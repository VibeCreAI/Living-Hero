import { Scene } from 'phaser';
import { BattleObstacle, Position } from '../types';

export type Obstacle = BattleObstacle;

export interface ObstacleInitOptions {
  layout?: Obstacle[];
  layoutIndex?: number;
  showLabels?: boolean;
  worldWidth?: number;
  worldHeight?: number;
}

export const OBSTACLE_CLEARANCE = 10;

const SEGMENT_STEP = 8;
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
  private worldWidth = 1024;
  private worldHeight = 768;
  private obstacles: Obstacle[] = [];
  private visuals: Phaser.GameObjects.GameObject[] = [];
  private labels: Phaser.GameObjects.Text[] = [];

  getObstacles(): Obstacle[] {
    return this.obstacles;
  }

  init(scene: Scene, options: ObstacleInitOptions = {}): void {
    this.worldWidth = options.worldWidth ?? this.worldWidth;
    this.worldHeight = options.worldHeight ?? this.worldHeight;

    const layout = options.layout
      ? options.layout
      : LAYOUTS[(options.layoutIndex ?? Math.floor(Math.random() * LAYOUTS.length)) % LAYOUTS.length];

    this.configureTextureSampling(scene);
    this.obstacles = layout.map((obstacle) => ({ ...obstacle }));

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

  isBlocked(pos: Position, padding = OBSTACLE_CLEARANCE): boolean {
    if (
      pos.x < padding ||
      pos.x > this.worldWidth - padding ||
      pos.y < padding ||
      pos.y > this.worldHeight - padding
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

  hasLineOfSight(from: Position, to: Position, padding = OBSTACLE_CLEARANCE): boolean {
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

  pushOut(pos: Position, padding = OBSTACLE_CLEARANCE): Position {
    const resolved = {
      x: Phaser.Math.Clamp(pos.x, padding, this.worldWidth - padding),
      y: Phaser.Math.Clamp(pos.y, padding, this.worldHeight - padding),
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

          resolved.x = Phaser.Math.Clamp(resolved.x, padding, this.worldWidth - padding);
          resolved.y = Phaser.Math.Clamp(resolved.y, padding, this.worldHeight - padding);
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
    return this.pushOut(pos);
  }

  findPath(_from: Position, _target: Position): Position[] | null {
    return null;
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
  }

  private createObstacleVisual(scene: Scene, obstacle: Obstacle): void {
    if (this.isWallObstacle(obstacle)) {
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
