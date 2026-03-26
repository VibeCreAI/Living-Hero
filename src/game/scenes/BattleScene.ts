import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { BattleLoop, BattleMapLayout, PlaygroundTargetConfig } from '../systems/BattleLoop';
import { Obstacle } from '../systems/Obstacles';
import { BattleResult, BattleMode, Position, UnitRole } from '../types';
import {
  createGroundTilemapLayer,
  getObjectLayerObjects,
  getStringProperty,
} from '../maps/tiled';
import { addRibbonLabel } from '../ui/RibbonLabel';

interface BattleSceneData {
  nodeId: string;
  difficulty: number;
  mode?: BattleMode;
}

export class BattleScene extends Scene {
  private battleLoop!: BattleLoop;
  private battleResult: BattleResult = null;
  private returnTimer = 0;
  private sceneData: BattleSceneData = { nodeId: '', difficulty: 1, mode: 'battle' };
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private playerChatHandler?: (message: string) => void;
  private battleStartHandler?: () => void;
  private playgroundExitHandler?: () => void;

  constructor() {
    super('BattleScene');
  }

  init(data: BattleSceneData): void {
    this.sceneData = { ...data, mode: data.mode ?? 'battle' };
    this.battleResult = null;
    this.returnTimer = 0;
  }

  create(): void {
    const isPlayground = this.sceneData.mode === 'playground';
    const mapLayout = this.createMapLayout(isPlayground ? 'playground' : 'battle');

    addRibbonLabel(this, {
      x: 512,
      y: 32,
      text: isPlayground ? 'PLAYGROUND' : 'BATTLE',
      tone: 'gold',
      depth: 11,
      ribbonScale: 0.9,
      textScale: 1.9,
    });

    addRibbonLabel(this, {
      x: 100,
      y: 62,
      text: 'ALLIES',
      tone: 'blue',
      depth: 11,
      ribbonScale: 0.68,
      textScale: 1.55,
    });

    addRibbonLabel(this, {
      x: 850,
      y: 62,
      text: isPlayground ? 'TARGETS' : 'ENEMIES',
      tone: isPlayground ? 'gold' : 'red',
      depth: 11,
      ribbonScale: 0.68,
      textScale: 1.55,
    });

    this.add
      .text(
        512,
        750,
        isPlayground
          ? 'Directive: use chat to command the hero | ESC:Exit'
          : 'Planning: chat strategy to the commander, then press Start Battle',
        {
          fontSize: '12px',
          color: '#cccccc',
          fontFamily: '"NeoDunggeunmoPro", monospace',
          backgroundColor: '#000000aa',
          padding: { x: 6, y: 3 },
        }
      )
      .setOrigin(0.5);

    if (isPlayground) {
      this.add
        .text(
          512,
          48,
          'Try chat: "Hold behind the center wall" or "archers hold bottom rocks while warriors focus north target"',
          {
            fontSize: '11px',
            color: '#cfefff',
            fontFamily: '"NeoDunggeunmoPro", monospace',
            backgroundColor: '#00000066',
            padding: { x: 6, y: 3 },
          }
        )
        .setOrigin(0.5);
    }

    this.battleLoop = new BattleLoop();
    this.battleLoop.init(this, {
      difficulty: this.sceneData.difficulty,
      mode: this.sceneData.mode,
      layout: mapLayout,
    });

    this.escapeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.playerChatHandler = (message: string) => {
      this.battleLoop.setPlayerDirective(message);
    };
    EventBus.on('player-chat-message', this.playerChatHandler);

    this.battleStartHandler = () => {
      if (this.sceneData.mode !== 'battle') {
        return;
      }

      this.battleLoop.startBattle();
      EventBus.emit('battle-started', this.battleLoop.getState());
    };
    EventBus.on('battle-start-requested', this.battleStartHandler);

    this.playgroundExitHandler = () => {
      if (this.sceneData.mode === 'playground') {
        this.returnToOverworld();
      }
    };
    EventBus.on('playground-exit-requested', this.playgroundExitHandler);

    EventBus.emit('current-scene-ready', this);
    EventBus.emit('battle-state-update', this.battleLoop.getState());
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    if (this.sceneData.mode === 'playground' && Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      this.returnToOverworld();
      return;
    }

    if (this.battleResult) {
      this.returnTimer += dt;
      if (this.returnTimer >= 3) {
        this.cleanUp();
        this.scene.start('OverworldScene');
      }
      return;
    }

    const result = this.battleLoop.update(dt);
    EventBus.emit('battle-state-update', this.battleLoop.getState());

    if (!result) {
      return;
    }

    this.battleResult = result;
    const isWin = result === 'allied_win';

    this.add
      .text(512, 384, isWin ? 'VICTORY!' : 'DEFEAT!', {
        fontSize: '48px',
        color: isWin ? '#00ff00' : '#ff0000',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(100);

    this.add
      .text(512, 430, 'Returning to overworld...', {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: '"NeoDunggeunmoPro", monospace',
      })
      .setOrigin(0.5)
      .setDepth(100);

    EventBus.emit('battle-ended', result);
  }

  private cleanUp(): void {
    if (this.playerChatHandler) {
      EventBus.removeListener('player-chat-message', this.playerChatHandler);
      this.playerChatHandler = undefined;
    }
    if (this.battleStartHandler) {
      EventBus.removeListener('battle-start-requested', this.battleStartHandler);
      this.battleStartHandler = undefined;
    }
    if (this.playgroundExitHandler) {
      EventBus.removeListener('playground-exit-requested', this.playgroundExitHandler);
      this.playgroundExitHandler = undefined;
    }
    this.battleLoop.destroy();
  }

  private returnToOverworld(): void {
    this.cleanUp();
    this.scene.start('OverworldScene');
  }

  private createMapLayout(mode: BattleMode): BattleMapLayout {
    const mapKey = mode === 'playground' ? 'playground-map' : 'battlefield-map';

    try {
      this.cameras.main.setBackgroundColor(mode === 'playground' ? '#2f4f5b' : '#3a6436');
      const map = createGroundTilemapLayer(this, mapKey, -22);
      const layout: BattleMapLayout = {
        obstacles: this.parseObstacles(map),
        heroSpawn: this.parseSingleSpawn(map, 'hero_spawn'),
        alliedSpawns: this.parseSpawnGroup(map, 'ally_spawn'),
      };

      if (mode === 'playground') {
        layout.playgroundTargets = this.parsePlaygroundTargets(map);
      } else {
        layout.enemySpawns = this.parseSpawnGroup(map, 'enemy_spawn');
      }

      return layout;
    } catch (error) {
      console.error(`[BattleScene] Failed to load ${mapKey}. Falling back to defaults.`, error);
      return {};
    }
  }

  private parseObstacles(map: Phaser.Tilemaps.Tilemap): Obstacle[] {
    const objects = getObjectLayerObjects(map, 'obstacles');
    const obstacles: Obstacle[] = [];

    for (const object of objects) {
      if (
        typeof object.x !== 'number' ||
        typeof object.y !== 'number' ||
        typeof object.width !== 'number' ||
        typeof object.height !== 'number'
      ) {
        continue;
      }

      const id = object.id !== undefined ? `obs-${object.id}` : `obs-${obstacles.length + 1}`;
      const label =
        typeof object.name === 'string' && object.name.trim().length > 0
          ? object.name.trim()
          : 'Obstacle';

      obstacles.push({
        id,
        label,
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
      });
    }

    return obstacles;
  }

  private parseSingleSpawn(map: Phaser.Tilemaps.Tilemap, spawnType: string): Position | undefined {
    const spawn = getObjectLayerObjects(map, 'spawns').find((object) =>
      this.objectTypeMatches(object, spawnType)
    );
    return spawn ? this.toPosition(spawn) ?? undefined : undefined;
  }

  private parseSpawnGroup(map: Phaser.Tilemaps.Tilemap, spawnType: string): Position[] {
    const spawns = getObjectLayerObjects(map, 'spawns')
      .filter((object) => this.objectTypeMatches(object, spawnType))
      .sort((a, b) => this.sortByName(a, b))
      .map((object) => this.toPosition(object))
      .filter((position): position is Position => position !== null);

    return spawns;
  }

  private parsePlaygroundTargets(map: Phaser.Tilemaps.Tilemap): PlaygroundTargetConfig[] {
    const targetObjects = getObjectLayerObjects(map, 'targets')
      .filter((object) => this.objectTypeMatches(object, 'target_spawn'))
      .sort((a, b) => this.sortByName(a, b));

    const targets: PlaygroundTargetConfig[] = [];
    for (const [index, object] of targetObjects.entries()) {
      const position = this.toPosition(object);
      if (!position) {
        continue;
      }

      const role = this.parseRole(getStringProperty(object, 'role'));
      const name =
        typeof object.name === 'string' && object.name.trim().length > 0
          ? object.name.trim()
          : `Target ${index + 1}`;

      targets.push({ name, role, position });
    }

    return targets;
  }

  private parseRole(value: string | undefined): UnitRole {
    return value === 'archer' ? 'archer' : 'warrior';
  }

  private objectTypeMatches(object: Phaser.Types.Tilemaps.TiledObject, expectedType: string): boolean {
    const objectType =
      typeof object.type === 'string' ? object.type.trim().toLowerCase() : '';
    const objectName =
      typeof object.name === 'string' ? object.name.trim().toLowerCase() : '';
    const expected = expectedType.toLowerCase();
    return objectType === expected || objectName === expected;
  }

  private sortByName(
    a: Phaser.Types.Tilemaps.TiledObject,
    b: Phaser.Types.Tilemaps.TiledObject
  ): number {
    const aName = typeof a.name === 'string' ? a.name : '';
    const bName = typeof b.name === 'string' ? b.name : '';
    return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
  }

  private toPosition(object: Phaser.Types.Tilemaps.TiledObject): Position | null {
    if (typeof object.x !== 'number' || typeof object.y !== 'number') {
      return null;
    }

    return { x: object.x, y: object.y };
  }
}
