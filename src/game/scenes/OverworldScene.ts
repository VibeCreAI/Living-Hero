import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { OVERWORLD_NODES as OVERWORLD_NODE_FALLBACK } from '../data/terrain';
import { BattleMode, OverworldNode, PortalFloorNumber, PortalProgressState } from '../types';
import { getPortalFloorConfig, MAX_PORTAL_FLOOR, PORTAL_NODE_ID } from '../data/portalFloors';
import {
  createGroundTilemapLayer,
  getNumberProperty,
  getObjectLayerObjects,
  getStringProperty,
} from '../maps/tiled';
import { loadPortalProgress } from '../state/PortalProgression';
import { addRibbonLabel } from '../ui/RibbonLabel';

interface TerrainDecorPlacement {
  key: string;
  x: number;
  y: number;
  scale: number;
  alpha?: number;
  depth?: number;
}

const OVERWORLD_CLOUDS: TerrainDecorPlacement[] = [
  { key: 'terrain-cloud-1', x: 170, y: 60, scale: 0.5, alpha: 0.28, depth: -20 },
  { key: 'terrain-cloud-2', x: 540, y: 72, scale: 0.56, alpha: 0.24, depth: -20 },
  { key: 'terrain-cloud-3', x: 840, y: 78, scale: 0.52, alpha: 0.26, depth: -20 },
];

const MAP_PADDING = 30;
const WORLD_WIDTH = 1024;
const WORLD_HEIGHT = 768;

export class OverworldScene extends Scene {
  private heroSprite!: Phaser.GameObjects.Sprite;
  private heroNameText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private promptText!: Phaser.GameObjects.Text;
  private nearNode: OverworldNode | null = null;
  private nodeSprites: Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Sprite> = new Map();
  private overworldNodes: OverworldNode[] = [];
  private heroPos = { x: 120, y: 400 };
  private readonly HERO_SPEED = 200;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private portalPickerOpen = false;
  private portalProgress: PortalProgressState = loadPortalProgress();
  private portalFloorStartHandler?: (payload: { floorNumber: PortalFloorNumber }) => void;
  private portalPickerCloseHandler?: () => void;

  constructor() {
    super('OverworldScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#365f3d');
    this.portalProgress = loadPortalProgress();
    this.loadMapData();
    this.spawnDecorations(OVERWORLD_CLOUDS);

    addRibbonLabel(this, {
      x: 512,
      y: 38,
      text: 'OVERWORLD',
      tone: 'gold',
      depth: 12,
      ribbonScale: 0.92,
      textScale: 2,
    });

    for (const node of this.overworldNodes) {
      const labelOffsetY = node.kind === 'portal' ? 86 : 50;
      const detailOffsetY = node.kind === 'portal' ? 104 : 66;
      if (node.kind === 'portal') {
        const nodeSprite = this.add.sprite(node.position.x, node.position.y, 'portal-main');
        nodeSprite.setScale(1.05);
        nodeSprite.setDepth(5);
        nodeSprite.play('portal-main-anim');
        this.nodeSprites.set(node.id, nodeSprite);
      } else {
        const nodeSprite = this.add.image(
          node.position.x,
          node.position.y,
          node.mode === 'playground' ? 'castle-blue' : 'castle-red'
        );
        nodeSprite.setScale(0.4);
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
        .setOrigin(0.5);

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
        .setOrigin(0.5);
    }

    this.heroSprite = this.add.sprite(this.heroPos.x, this.heroPos.y, 'blue-hero-idle');
    this.heroSprite.setScale(0.75);
    this.heroSprite.setDepth(5.2);
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
      .setDepth(7);
    this.heroNameText.setResolution(2);

    this.promptText = this.add
      .text(512, 720, '', {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.bindPortalEvents();

    EventBus.emit('current-scene-ready', this);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    let dx = 0;
    let dy = 0;

    if (!this.portalPickerOpen) {
      if (this.cursors.left.isDown) dx -= 1;
      if (this.cursors.right.isDown) dx += 1;
      if (this.cursors.up.isDown) dy -= 1;
      if (this.cursors.down.isDown) dy += 1;
    }

    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    this.heroPos.x += dx * this.HERO_SPEED * dt;
    this.heroPos.y += dy * this.HERO_SPEED * dt;

    this.heroPos.x = Phaser.Math.Clamp(this.heroPos.x, MAP_PADDING, WORLD_WIDTH - MAP_PADDING);
    this.heroPos.y = Phaser.Math.Clamp(this.heroPos.y, MAP_PADDING, WORLD_HEIGHT - MAP_PADDING);

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
      const dx2 = this.heroPos.x - node.position.x;
      const dy2 = this.heroPos.y - node.position.y;
      const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
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

  private loadMapData(): void {
    const map = createGroundTilemapLayer(this, 'overworld-map', -40);

    const spawnObjects = getObjectLayerObjects(map, 'spawns');
    const heroSpawn = spawnObjects.find((object) => this.objectTypeIs(object, 'hero_spawn'));
    if (heroSpawn && typeof heroSpawn.x === 'number' && typeof heroSpawn.y === 'number') {
      this.heroPos = {
        x: heroSpawn.x,
        y: heroSpawn.y,
      };
    }

    const nodeObjects = getObjectLayerObjects(map, 'nodes');
    const nodes: OverworldNode[] = [];
    for (const [index, object] of nodeObjects.entries()) {
      if (typeof object.x !== 'number' || typeof object.y !== 'number') {
        continue;
      }

      const id = getStringProperty(object, 'id') ?? object.name ?? `node-${index + 1}`;
      const label = getStringProperty(object, 'label') ?? object.name ?? `Node ${index + 1}`;
      const difficulty = getNumberProperty(object, 'difficulty') ?? 1;
      const mode = this.parseBattleMode(getStringProperty(object, 'mode'));
      const kind = this.parseNodeKind(getStringProperty(object, 'kind'));

      nodes.push({
        id,
        position: { x: object.x, y: object.y },
        label,
        kind,
        difficulty,
        completed: false,
        mode,
      });
    }

    this.overworldNodes = nodes.length > 0 ? nodes : OVERWORLD_NODE_FALLBACK.map((node) => ({ ...node }));
  }

  private parseBattleMode(value: string | undefined): BattleMode | undefined {
    if (value === 'battle' || value === 'playground') {
      return value;
    }

    return undefined;
  }

  private parseNodeKind(value: string | undefined): OverworldNode['kind'] {
    return value === 'portal' ? 'portal' : 'node';
  }

  private objectTypeIs(object: Phaser.Types.Tilemaps.TiledObject, expected: string): boolean {
    const type = typeof object.type === 'string' ? object.type.trim().toLowerCase() : '';
    const name = typeof object.name === 'string' ? object.name.trim().toLowerCase() : '';
    const target = expected.toLowerCase();
    return type === target || name === target;
  }

  private spawnDecorations(placements: TerrainDecorPlacement[]): void {
    for (const placement of placements) {
      const sprite = this.add.image(placement.x, placement.y, placement.key);
      sprite.setDepth(placement.depth ?? -30);
      sprite.setScale(placement.scale);
      sprite.setAlpha(placement.alpha ?? 0.82);
    }
  }

  private bindPortalEvents(): void {
    this.portalFloorStartHandler = (payload) => {
      if (!this.portalPickerOpen) {
        return;
      }
      if (payload.floorNumber > this.portalProgress.highestUnlockedFloor) {
        return;
      }

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
