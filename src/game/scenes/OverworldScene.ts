import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { OVERWORLD_NODES } from '../data/terrain';
import { OverworldNode, PortalFloorNumber, PortalProgressState, TileCoord } from '../types';
import { getPortalFloorConfig, MAX_PORTAL_FLOOR, PORTAL_NODE_ID } from '../data/portalFloors';
import { createProceduralTilemapStack } from '../maps/tiled';
import {
  generateIslandMap,
  GeneratedTerrainMap,
  OverlayStamp,
  TerrainZone,
} from '../maps/islandGenerator';
import { loadPortalProgress } from '../state/PortalProgression';
import { addRibbonLabel } from '../ui/RibbonLabel';
import { isMappingWorkspace, MappingWorkspace, prepareWorkspace } from '../maps/tileMapping';

const MAP_COLS = 40;
const MAP_ROWS = 30;
const TILE_SIZE = 48;
const WORLD_WIDTH = MAP_COLS * TILE_SIZE;
const WORLD_HEIGHT = MAP_ROWS * TILE_SIZE;
const ISLAND_SEED = 42;
const HERO_COLLISION_RADIUS = 10;
const HERO_FOOT_OFFSET_Y = 14;
const FOAM_SPRITE_SIZE = 192;

const HERO_SPEED = 200;
const HERO_SPAWN = { x: 660, y: 780 };

export class OverworldScene extends Scene {
  private waterBg?: Phaser.GameObjects.TileSprite;
  private heroSprite!: Phaser.GameObjects.Sprite;
  private heroNameText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private promptText!: Phaser.GameObjects.Text;
  private nearNode: OverworldNode | null = null;
  private nodeSprites: Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Sprite> =
    new Map();
  private overworldNodes: OverworldNode[] = [];
  private heroPos = { x: HERO_SPAWN.x, y: HERO_SPAWN.y };
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private portalPickerOpen = false;
  private portalProgress: PortalProgressState = loadPortalProgress();
  private portalFloorStartHandler?: (payload: { floorNumber: PortalFloorNumber }) => void;
  private portalPickerCloseHandler?: () => void;
  private resizeHandler?: (gameSize: Phaser.Structs.Size) => void;
  private terrain!: GeneratedTerrainMap;

  constructor() {
    super('OverworldScene');
  }

  create(): void {
    this.portalProgress = loadPortalProgress();
    this.overworldNodes = OVERWORLD_NODES.map((node) => ({ ...node }));
    this.terrain = generateIslandMap({
      cols: MAP_COLS,
      rows: MAP_ROWS,
      tileSize: TILE_SIZE,
      seed: ISLAND_SEED,
      nodeAnchors: {
        heroSpawn: HERO_SPAWN,
        portal: this.getNodePosition(PORTAL_NODE_ID),
        trainingGrounds: this.getNodePosition('node-playground'),
      },
      mappingWorkspace: this.getRepoMappingWorkspace(),
      profile: 'overworld',
    });
    this.applyGeneratedPlacements();

    this.buildWorld();
    this.createNodeSprites();
    this.createHero();
    this.createHud();

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.heroSprite, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(100, 75);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.moveKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.bindPortalEvents();

    EventBus.emit('current-scene-ready', this);
  }

  private applyGeneratedPlacements(): void {
    this.heroPos = this.terrain.placements?.heroSpawn
      ? { ...this.terrain.placements.heroSpawn }
      : { ...HERO_SPAWN };

    if (!this.terrain.placements) {
      return;
    }

    this.overworldNodes = this.overworldNodes.map((node) => {
      if (node.id === PORTAL_NODE_ID) {
        return { ...node, position: { ...this.terrain.placements!.portal } };
      }
      if (node.id === 'node-playground') {
        return { ...node, position: { ...this.terrain.placements!.trainingGrounds } };
      }
      return node;
    });
  }

  private buildWorld(): void {
    this.cameras.main.setBackgroundColor('#5b9a8b');
    this.waterBg = this.add.tileSprite(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      WORLD_WIDTH,
      WORLD_HEIGHT,
      'water-bg',
    );
    this.waterBg.tileScaleX = TILE_SIZE / 64;
    this.waterBg.tileScaleY = TILE_SIZE / 64;
    this.waterBg.setDepth(-100);

    this.renderSampleDecorations('water');
    this.renderOverlayStamps(this.terrain.foamStamps);
    createProceduralTilemapStack(this, this.terrain.tileLayers);
    this.renderOverlayStamps(this.terrain.shadowStamps);
    this.placeDecorations();
    this.placeClouds();
  }

  private getRepoMappingWorkspace(): MappingWorkspace | undefined {
    const raw = this.cache.text.get('tile-mapper-workspace');
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return isMappingWorkspace(parsed) ? prepareWorkspace(parsed) : undefined;
    } catch {
      return undefined;
    }
  }

  private renderOverlayStamps(stamps: OverlayStamp[]): void {
    for (const stamp of stamps) {
      if (stamp.kind === 'foam') {
        const centerX = (stamp.col + 0.5) * TILE_SIZE;
        const centerY = (stamp.row + 0.5) * TILE_SIZE;
        const foam = this.add.sprite(centerX, centerY, 'water-foam');
        const displaySize = TILE_SIZE * 3 * stamp.scale;
        foam.setDisplaySize(displaySize, displaySize);
        foam.setDepth(stamp.depth);
        foam.setAlpha(0.92);
        foam.play({
          key: 'water-foam-anim',
          startFrame:
            stamp.framePolicy === 'random-start' ? Phaser.Math.Between(0, 15) : 0,
        });
        continue;
      }

      const centerX = (stamp.col + 0.5) * TILE_SIZE;
      const centerY = (stamp.row + 0.5) * TILE_SIZE;
      const shadow = this.add.image(centerX, centerY, 'terrain-shadow');
      const displaySize = TILE_SIZE * 3 * stamp.scale;
      shadow.setDisplaySize(displaySize, displaySize);
      shadow.setDepth(stamp.depth);
      shadow.setAlpha(0.55);
    }
  }

  private createHero(): void {
    this.heroSprite = this.add.sprite(this.heroPos.x, this.heroPos.y, 'blue-hero-idle');
    this.heroSprite.setScale(0.75);
    this.heroSprite.setDepth(8);
    this.heroSprite.play('blue-hero-idle-anim');

    this.heroNameText = this.add
      .text(this.heroPos.x, this.heroPos.y - 78, 'Commander', {
        fontSize: '11px',
        color: '#f7e08c',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        stroke: '#172016',
        strokeThickness: 3,
        backgroundColor: '#10170fcc',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(9);
    this.heroNameText.setResolution(2);
  }

  private createHud(): void {
    const cam = this.cameras.main;
    addRibbonLabel(this, {
      x: cam.width / 2,
      y: 38,
      text: 'OVERWORLD',
      tone: 'gold',
      depth: 20,
      ribbonScale: 0.92,
      textScale: 2,
      scrollFactor: 0,
    });

    this.promptText = this.add
      .text(cam.width / 2, cam.height - 48, '', {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setScrollFactor(0)
      .setDepth(22);

    this.resizeHandler = (gameSize: Phaser.Structs.Size) => {
      this.promptText.setPosition(gameSize.width / 2, gameSize.height - 48);
    };
    this.scale.on('resize', this.resizeHandler);
  }

  private placeDecorations(): void {
    if (this.terrain.sampleDecorations?.length) {
      this.renderSampleDecorations('land');
      return;
    }

    const rng = mulberry32(ISLAND_SEED + 31);
    const occupied: Array<{ x: number; y: number; radius: number }> = [];
    const bushPoints: Array<{ x: number; y: number }> = [];
    const treePoints: Array<{ x: number; y: number }> = [];
    const exclusionZones = [
      ...this.terrain.clearZones,
      ...this.terrain.decorationZones.filter((zone) => zone.kind === 'stair_landing'),
    ];

    const reserve = (x: number, y: number, radius: number) => {
      occupied.push({ x, y, radius });
    };

    const getTileAtPoint = (x: number, y: number): TileCoord | null => {
      const col = Math.floor(x / TILE_SIZE);
      const row = Math.floor(y / TILE_SIZE);
      return this.inBounds(row, col) ? { col, row } : null;
    };

    const createsRowPattern = (
      points: Array<{ x: number; y: number }>,
      x: number,
      y: number,
      axisThreshold: number,
    ): boolean => {
      let horizontalMatches = 0;
      let verticalMatches = 0;
      for (const point of points) {
        if (Math.abs(point.y - y) <= axisThreshold && Math.abs(point.x - x) > axisThreshold * 1.5) {
          horizontalMatches += 1;
        }
        if (Math.abs(point.x - x) <= axisThreshold && Math.abs(point.y - y) > axisThreshold * 1.5) {
          verticalMatches += 1;
        }
        if (horizontalMatches >= 2 || verticalMatches >= 2) {
          return true;
        }
      }
      return false;
    };

    const canPlace = (
      x: number,
      y: number,
      options: {
        minWaterDistance: number;
        allowShoreline: boolean;
        flatOnly: boolean;
        spacing: number;
        rowCheck?: { points: Array<{ x: number; y: number }>; axisThreshold: number };
      },
    ): TileCoord | null => {
      const tile = getTileAtPoint(x, y);
      if (!tile) {
        return null;
      }

      if (!this.terrain.walkMask[tile.row][tile.col]) {
        return null;
      }

      if (options.flatOnly && this.terrain.heightMap[tile.row][tile.col] !== 1) {
        return null;
      }

      if (
        !options.allowShoreline &&
        this.distanceToWater(tile.row, tile.col) < options.minWaterDistance
      ) {
        return null;
      }

      if (
        exclusionZones.some((zone) => tileDistance(zone.col, zone.row, tile.col, tile.row) <= zone.radius)
      ) {
        return null;
      }

      if (
        occupied.some(
          (entry) => Phaser.Math.Distance.Between(entry.x, entry.y, x, y) < entry.radius + options.spacing,
        )
      ) {
        return null;
      }

      if (
        options.rowCheck &&
        createsRowPattern(options.rowCheck.points, x, y, options.rowCheck.axisThreshold)
      ) {
        return null;
      }

      return tile;
    };

    for (const zone of this.terrain.decorationZones) {
      if (zone.kind === 'bush_cluster') {
        const count = 3 + Math.floor(rng() * 5);
        const clusterX = zone.col * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * 32;
        const clusterY = zone.row * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * 28;
        let placed = 0;
        for (let attempt = 0; attempt < 40 && placed < count; attempt++) {
          const angle = rng() * Math.PI * 2;
          const radius = 8 + Math.sqrt(rng()) * 54;
          const x = clusterX + Math.cos(angle) * radius;
          const y = clusterY + Math.sin(angle) * radius * 0.9;
          const candidate = canPlace(x, y, {
            minWaterDistance: 3,
            allowShoreline: false,
            flatOnly: true,
            spacing: 16,
            rowCheck: { points: bushPoints, axisThreshold: 10 },
          });
          if (!candidate) {
            continue;
          }

          const bush = this.add.image(
            x,
            y,
            pickOne(rng, ['terrain-bush-1', 'terrain-bush-2', 'terrain-bush-3', 'terrain-bush-4']),
          );
          bush.setScale(0.34 + rng() * 0.12);
          bush.setDepth(candidate.row * 0.1 + 2.15);
          reserve(x, y, 16);
          bushPoints.push({ x, y });
          placed += 1;
        }
      }

      if (zone.kind === 'tree_grove') {
        const count = 2 + Math.floor(rng() * 3);
        const groveX = zone.col * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * 36;
        const groveY = zone.row * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * 30;
        let placed = 0;
        for (let attempt = 0; attempt < 28 && placed < count; attempt++) {
          const angle = rng() * Math.PI * 2;
          const radius = 14 + Math.sqrt(rng()) * 62;
          const x = groveX + Math.cos(angle) * radius;
          const y = groveY + Math.sin(angle) * radius * 0.82;
          const candidate = canPlace(x, y, {
            minWaterDistance: 3,
            allowShoreline: false,
            flatOnly: true,
            spacing: 34,
            rowCheck: { points: treePoints, axisThreshold: 18 },
          });
          if (!candidate) {
            continue;
          }

          const treeKey = pickOne(rng, ['tree-1', 'tree-2', 'tree-3', 'tree-4']);
          const tree = this.add.sprite(x, y - 20, treeKey);
          tree.play({ key: `${treeKey}-anim`, startFrame: Math.floor(rng() * 8) });
          tree.setScale(0.38 + rng() * 0.1);
          tree.setDepth(candidate.row * 0.1 + 3);
          reserve(x, y, 34);
          treePoints.push({ x, y });
          placed += 1;
        }
      }

      if (zone.kind === 'shore_rock') {
        const landTile = this.jitterTile(zone, rng, 1.2);
        const waterTile = this.findAdjacentWaterTile(landTile.row, landTile.col);
        if (waterTile) {
          const rockX = waterTile.col * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * 10;
          const rockY = waterTile.row * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * 8;
          if (
            occupied.some(
              (entry) => Phaser.Math.Distance.Between(entry.x, entry.y, rockX, rockY) < entry.radius + 26,
            )
          ) {
            continue;
          }

          const sprite = this.add.sprite(
            rockX,
            rockY,
            pickOne(rng, ['water-rock-1', 'water-rock-2', 'water-rock-3']),
          );
          const animationKey = `${sprite.texture.key}-anim`;
          sprite.play({ key: animationKey, startFrame: Math.floor(rng() * 16) });
          sprite.setScale(0.72 + rng() * 0.18);
          sprite.setDepth(-15);
          reserve(rockX, rockY, 26);
        }
      }

      if (zone.kind === 'inland_rock') {
        for (let attempt = 0; attempt < 12; attempt++) {
          const x =
            zone.col * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * (18 + zone.radius * TILE_SIZE);
          const y =
            zone.row * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * (14 + zone.radius * TILE_SIZE * 0.8);
          const candidate = canPlace(x, y, {
            minWaterDistance: 2,
            allowShoreline: true,
            flatOnly: false,
            spacing: 24,
          });
          if (!candidate) {
            continue;
          }

          const rock = this.add.image(
            x,
            y,
            pickOne(rng, ['terrain-rock-1', 'terrain-rock-2', 'terrain-rock-3', 'terrain-rock-4']),
          );
          rock.setScale(0.3 + rng() * 0.1);
          rock.setDepth(candidate.row * 0.1 + 2.1);
          reserve(x, y, 24);
          break;
        }
      }
    }
  }

  private renderSampleDecorations(layer: 'water' | 'land'): void {
    const decorations = this.terrain.sampleDecorations?.filter((decoration) => decoration.layer === layer);
    if (!decorations?.length) {
      return;
    }

    for (const decoration of decorations) {
      const x = (decoration.col + 0.5 + decoration.offsetX) * TILE_SIZE;
      const y = (decoration.row + decoration.offsetY) * TILE_SIZE;
      const displayWidth = decoration.width * TILE_SIZE;
      const displayHeight = decoration.height * TILE_SIZE;
      const textureKey = decoration.textureKey ?? this.getSampleDecorationTextureKey(decoration.src);
      if (!textureKey) {
        continue;
      }

      const animated = Boolean(decoration.animated && decoration.animationKey);
      const gameObject = animated
        ? this.add.sprite(x, y, textureKey)
        : this.add.image(x, y, textureKey);

      gameObject.setOrigin(0.5, 1);
      gameObject.setDisplaySize(displayWidth, displayHeight);
      gameObject.setDepth(this.getSampleDecorationDepth(decoration, y));

      if (animated && gameObject instanceof Phaser.GameObjects.Sprite) {
        gameObject.play({
          key: decoration.animationKey!,
          startFrame: decoration.frameIndex,
        });
      }
    }
  }

  private getSampleDecorationTextureKey(src: string): string | null {
    if (src.includes('/Trees/Tree1')) return 'tree-1';
    if (src.includes('/Trees/Tree2')) return 'tree-2';
    if (src.includes('/Trees/Tree3')) return 'tree-3';
    if (src.includes('/Trees/Tree4')) return 'tree-4';
    if (src.includes('/Bushes/Bushe1')) return 'terrain-bush-1-sheet';
    if (src.includes('/Bushes/Bushe2')) return 'terrain-bush-2-sheet';
    if (src.includes('/Bushes/Bushe3')) return 'terrain-bush-3-sheet';
    if (src.includes('/Bushes/Bushe4')) return 'terrain-bush-4-sheet';
    if (src.includes('/Rocks/Rock1')) return 'terrain-rock-1';
    if (src.includes('/Rocks/Rock2')) return 'terrain-rock-2';
    if (src.includes('/Rocks/Rock3')) return 'terrain-rock-3';
    if (src.includes('/Rocks/Rock4')) return 'terrain-rock-4';
    if (src.includes('/Water Rocks_01')) return 'water-rock-1';
    if (src.includes('/Water Rocks_02')) return 'water-rock-2';
    if (src.includes('/Water Rocks_03')) return 'water-rock-3';
    return null;
  }

  private getSampleDecorationDepth(
    decoration: NonNullable<GeneratedTerrainMap['sampleDecorations']>[number],
    baseY: number,
  ): number {
    if (decoration.layer === 'water') {
      return -60;
    }

    const rowDepth = baseY / TILE_SIZE;
    if (decoration.kind === 'tree') {
      return rowDepth * 0.1 + 3;
    }
    return rowDepth * 0.1 + 2.15;
  }

  private placeClouds(): void {
    const rng = mulberry32(ISLAND_SEED + 51);
    for (let index = 0; index < 5; index++) {
      const cloud = this.add.image(
        rng() * WORLD_WIDTH,
        50 + rng() * 180,
        pickOne(rng, ['terrain-cloud-1', 'terrain-cloud-2', 'terrain-cloud-3', 'terrain-cloud-4']),
      );
      cloud.setScale(0.4 + rng() * 0.2);
      cloud.setAlpha(0.18 + rng() * 0.08);
      cloud.setDepth(-18);
      cloud.setScrollFactor(0.3, 0.3);
    }
  }

  private createNodeSprites(): void {
    for (const node of this.overworldNodes) {
      const labelOffsetY = node.kind === 'portal' ? 86 : 50;
      const detailOffsetY = node.kind === 'portal' ? 104 : 66;

      if (node.kind === 'portal') {
        const nodeSprite = this.add.sprite(node.position.x, node.position.y, 'portal-main');
        nodeSprite.setScale(1.05);
        nodeSprite.setDepth(11);
        nodeSprite.play('portal-main-anim');
        this.nodeSprites.set(node.id, nodeSprite);
      } else {
        const nodeSprite = this.add.image(
          node.position.x,
          node.position.y,
          node.mode === 'playground' ? 'castle-blue' : 'castle-red',
        );
        nodeSprite.setScale(0.4);
        nodeSprite.setDepth(11);
        this.nodeSprites.set(node.id, nodeSprite);
      }

      this.add
        .text(node.position.x, node.position.y + labelOffsetY, node.label, {
          fontSize: '12px',
          color: '#ffffff',
          fontFamily: '"NeoDunggeunmoPro", monospace',
          backgroundColor: '#00000088',
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(12);

      const difficultyText =
        node.kind === 'portal'
          ? `Floors 1-${MAX_PORTAL_FLOOR}`
          : node.mode === 'playground'
            ? 'Sandbox'
            : '\u2605'.repeat(Math.ceil(node.difficulty));
      this.add
        .text(node.position.x, node.position.y + detailOffsetY, difficultyText, {
          fontSize: '12px',
          color: node.mode === 'playground' ? '#66ccff' : '#ffcc00',
          fontFamily: '"NeoDunggeunmoPro", monospace',
        })
        .setOrigin(0.5)
        .setDepth(12);
    }
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.waterBg) {
      this.waterBg.tilePositionX += dt * 10;
      this.waterBg.tilePositionY += dt * 3;
    }
    let dx = 0;
    let dy = 0;

    if (!this.portalPickerOpen) {
      if (this.cursors.left.isDown || this.moveKeys.left.isDown) dx -= 1;
      if (this.cursors.right.isDown || this.moveKeys.right.isDown) dx += 1;
      if (this.cursors.up.isDown || this.moveKeys.up.isDown) dy -= 1;
      if (this.cursors.down.isDown || this.moveKeys.down.isDown) dy += 1;
    }

    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    if (dx !== 0 || dy !== 0) {
      const newX = this.heroPos.x + dx * HERO_SPEED * dt;
      const newY = this.heroPos.y + dy * HERO_SPEED * dt;

      if (this.canMoveTo(this.heroPos.x, this.heroPos.y, newX, newY)) {
        this.heroPos.x = newX;
        this.heroPos.y = newY;
      } else if (this.canMoveTo(this.heroPos.x, this.heroPos.y, newX, this.heroPos.y)) {
        this.heroPos.x = newX;
      } else if (this.canMoveTo(this.heroPos.x, this.heroPos.y, this.heroPos.x, newY)) {
        this.heroPos.y = newY;
      }
    }

    this.heroSprite.setPosition(this.heroPos.x, this.heroPos.y);
    this.heroNameText.setPosition(this.heroPos.x, this.heroPos.y - 78);
    if (dx !== 0 || dy !== 0) {
      this.heroSprite.play('blue-hero-run-anim', true);
      this.heroSprite.setFlipX(dx < 0);
    } else {
      this.heroSprite.play('blue-hero-idle-anim', true);
    }

    this.nearNode = null;
    for (const node of this.overworldNodes) {
      const dist = Phaser.Math.Distance.Between(
        this.heroPos.x,
        this.heroPos.y,
        node.position.x,
        node.position.y,
      );
      const interactionRadius = node.kind === 'portal' ? 88 : 70;
      if (dist < interactionRadius) {
        this.nearNode = node;
        break;
      }
    }

    if (this.nearNode) {
      if (this.portalPickerOpen && this.nearNode.kind === 'portal') {
        this.promptText.setVisible(false);
      } else {
        const verb =
          this.nearNode.kind === 'portal'
            ? 'enter portal'
            : this.nearNode.mode === 'playground'
              ? 'enter playground'
              : 'enter battle';
        this.promptText.setText(`Press SPACE to ${verb}: ${this.nearNode.label}`);
        this.promptText.setVisible(true);
      }

      if (!this.portalPickerOpen && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        if (this.nearNode.kind === 'portal') {
          this.portalPickerOpen = true;
        } else {
          this.scene.start('BattleScene', {
            nodeId: this.nearNode.id,
            difficulty: this.nearNode.difficulty,
            mode: this.nearNode.mode ?? 'battle',
          });
        }
      }
    } else {
      this.promptText.setVisible(false);
    }

    EventBus.emit('overworld-update', {
      heroPosition: { ...this.heroPos },
      nearNode: this.nearNode?.label ?? null,
      nearNodeKind: this.nearNode?.kind ?? null,
      portalPickerOpen: this.portalPickerOpen,
      highestUnlockedFloor: this.portalProgress.highestUnlockedFloor,
      highestClearedFloor: this.portalProgress.highestClearedFloor,
    });
  }

  private canMoveTo(fromX: number, fromY: number, toX: number, toY: number): boolean {
    if (!this.canOccupy(toX, toY)) {
      return false;
    }

    const fromTile = this.getMovementTile(fromX, fromY);
    const toTile = this.getMovementTile(toX, toY);
    if (!fromTile || !toTile) {
      return false;
    }

    const fromCol = fromTile.col;
    const fromRow = fromTile.row;
    const toCol = toTile.col;
    const toRow = toTile.row;

    if (!this.inBounds(fromRow, fromCol) || !this.inBounds(toRow, toCol)) {
      return false;
    }

    if (fromRow === toRow && fromCol === toCol) {
      return true;
    }

    const rowDelta = toRow - fromRow;
    const colDelta = toCol - fromCol;
    if (Math.abs(rowDelta) + Math.abs(colDelta) !== 1) {
      return false;
    }

    if (!this.terrain.walkMask[fromRow][fromCol] || !this.terrain.walkMask[toRow][toCol]) {
      return false;
    }

    if (rowDelta === -1) {
      return (
        this.terrain.passabilityMap[fromRow][fromCol].north &&
        this.terrain.passabilityMap[toRow][toCol].south
      );
    }
    if (rowDelta === 1) {
      return (
        this.terrain.passabilityMap[fromRow][fromCol].south &&
        this.terrain.passabilityMap[toRow][toCol].north
      );
    }
    if (colDelta === -1) {
      return (
        this.terrain.passabilityMap[fromRow][fromCol].west &&
        this.terrain.passabilityMap[toRow][toCol].east
      );
    }
    return (
      this.terrain.passabilityMap[fromRow][fromCol].east &&
      this.terrain.passabilityMap[toRow][toCol].west
    );
  }

  private canOccupy(x: number, y: number): boolean {
    const tile = this.getMovementTile(x, y);
    if (!tile || !this.terrain.walkMask[tile.row][tile.col]) {
      return false;
    }

    const footY = y + HERO_FOOT_OFFSET_Y;
    const localX = x - tile.col * TILE_SIZE;
    const localY = footY - tile.row * TILE_SIZE;
    const passable = this.terrain.passabilityMap[tile.row][tile.col];
    if (!passable.north && localY < HERO_COLLISION_RADIUS) {
      return false;
    }
    if (!passable.south && localY > TILE_SIZE - HERO_COLLISION_RADIUS) {
      return false;
    }
    if (!passable.west && localX < HERO_COLLISION_RADIUS) {
      return false;
    }
    if (!passable.east && localX > TILE_SIZE - HERO_COLLISION_RADIUS) {
      return false;
    }

    const offsets = [
      { x: 0, y: -HERO_COLLISION_RADIUS },
      { x: HERO_COLLISION_RADIUS, y: 0 },
      { x: HERO_COLLISION_RADIUS * 0.7, y: HERO_COLLISION_RADIUS * 0.7 },
      { x: 0, y: HERO_COLLISION_RADIUS },
      { x: -HERO_COLLISION_RADIUS * 0.7, y: HERO_COLLISION_RADIUS * 0.7 },
      { x: -HERO_COLLISION_RADIUS, y: 0 },
      { x: -HERO_COLLISION_RADIUS * 0.7, y: -HERO_COLLISION_RADIUS * 0.7 },
      { x: HERO_COLLISION_RADIUS * 0.7, y: -HERO_COLLISION_RADIUS * 0.7 },
    ];

    return offsets.every((offset) => this.isWalkablePoint(x + offset.x, y + offset.y));
  }

  private isWalkablePoint(x: number, y: number): boolean {
    const tile = this.getMovementTile(x, y);
    return tile ? this.terrain.walkMask[tile.row][tile.col] : false;
  }

  private getMovementTile(x: number, y: number): TileCoord | null {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor((y + HERO_FOOT_OFFSET_Y) / TILE_SIZE);
    return this.inBounds(row, col) ? { col, row } : null;
  }

  private inBounds(row: number, col: number): boolean {
    return row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS;
  }

  private jitterTile(zone: TerrainZone, rng: () => number, radius: number): TileCoord {
    const angle = rng() * Math.PI * 2;
    const distance = rng() * radius;
    return {
      col: Math.round(zone.col + Math.cos(angle) * distance),
      row: Math.round(zone.row + Math.sin(angle) * distance),
    };
  }

  private distanceToWater(row: number, col: number): number {
    let radius = 0;
    while (radius < 5) {
      radius += 1;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nextRow = row + dr;
          const nextCol = col + dc;
          if (
            !this.inBounds(nextRow, nextCol) ||
            this.terrain.heightMap[nextRow][nextCol] === 0
          ) {
            return radius;
          }
        }
      }
    }
    return radius;
  }

  private findAdjacentWaterTile(row: number, col: number): TileCoord | null {
    const candidates = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];

    for (const candidate of candidates) {
      if (
        !this.inBounds(candidate.row, candidate.col) ||
        this.terrain.heightMap[candidate.row][candidate.col] !== 0
      ) {
        continue;
      }
      return candidate;
    }

    return null;
  }

  private getNodePosition(id: string): { x: number; y: number } {
    return this.overworldNodes.find((node) => node.id === id)?.position ?? { x: 0, y: 0 };
  }

  private bindPortalEvents(): void {
    this.portalFloorStartHandler = (payload) => {
      if (!this.portalPickerOpen) return;
      if (payload.floorNumber > this.portalProgress.highestUnlockedFloor) return;

      const floorConfig = getPortalFloorConfig(payload.floorNumber);
      this.portalPickerOpen = false;
      this.scene.start('BattleScene', {
        nodeId: PORTAL_NODE_ID,
        difficulty: floorConfig.statMultiplier,
        floorNumber: payload.floorNumber,
        mode: 'battle',
      });
    };
    EventBus.on('portal-floor-start-requested', this.portalFloorStartHandler);

    this.portalPickerCloseHandler = () => {
      this.portalPickerOpen = false;
    };
    EventBus.on('portal-picker-close-requested', this.portalPickerCloseHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.resizeHandler) {
        this.scale.off('resize', this.resizeHandler);
        this.resizeHandler = undefined;
      }
      if (this.portalFloorStartHandler) {
        EventBus.removeListener('portal-floor-start-requested', this.portalFloorStartHandler);
        this.portalFloorStartHandler = undefined;
      }
      if (this.portalPickerCloseHandler) {
        EventBus.removeListener('portal-picker-close-requested', this.portalPickerCloseHandler);
        this.portalPickerCloseHandler = undefined;
      }
    });
  }
}

function pickOne<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function tileDistance(colA: number, rowA: number, colB: number, rowB: number): number {
  return Math.abs(colA - colB) + Math.abs(rowA - rowB);
}
