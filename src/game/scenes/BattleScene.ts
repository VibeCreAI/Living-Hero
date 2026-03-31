import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { BattleLoop, BattleMapLayout, PlaygroundTargetConfig } from '../systems/BattleLoop';
import { Obstacle } from '../systems/Obstacles';
import {
  BattleResult,
  BattleMode,
  BattleSummaryData,
  Position,
  UnitRole,
  PlayerChatMessageEvent,
  PortalFloorNumber,
} from '../types';
import {
  createGroundTilemapLayer,
  getObjectLayerObjects,
  getStringProperty,
} from '../maps/tiled';
import { getNextPortalFloor, getPortalFloorConfig } from '../data/portalFloors';
import { unlockPortalFloor } from '../state/PortalProgression';
import { addRibbonLabel } from '../ui/RibbonLabel';

interface BattleSceneData {
  nodeId: string;
  difficulty: number;
  floorNumber?: PortalFloorNumber;
  mode?: BattleMode;
}

export class BattleScene extends Scene {
  private battleLoop!: BattleLoop;
  private battleResult: BattleResult = null;
  private sceneData: BattleSceneData = { nodeId: '', difficulty: 1, mode: 'battle' };
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private playerChatHandler?: (message: PlayerChatMessageEvent) => void;
  private battleStartHandler?: () => void;
  private playgroundExitHandler?: () => void;
  private returnToOverworldHandler?: () => void;
  private replayBattleHandler?: () => void;
  private advanceFloorHandler?: () => void;

  constructor() {
    super('BattleScene');
  }

  init(data: BattleSceneData): void {
    this.sceneData = { ...data, mode: data.mode ?? 'battle' };
    this.battleResult = null;
  }

  create(): void {
    const isPlayground = this.sceneData.mode === 'playground';
    const mapLayout = this.createMapLayout(isPlayground ? 'playground' : 'battle');
    const battleLabel =
      isPlayground
        ? 'PLAYGROUND'
        : this.sceneData.floorNumber
          ? `FLOOR ${this.sceneData.floorNumber}`
          : 'BATTLE';

    addRibbonLabel(this, {
      x: 512,
      y: 32,
      text: battleLabel,
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

    this.battleLoop = new BattleLoop();
    this.battleLoop.init(this, {
      nodeId: this.sceneData.nodeId,
      difficulty: this.sceneData.difficulty,
      floorNumber: this.sceneData.floorNumber,
      mode: this.sceneData.mode,
      layout: mapLayout,
    });

    this.escapeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.playerChatHandler = (message: PlayerChatMessageEvent) => {
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

    this.returnToOverworldHandler = () => {
      this.returnToOverworld();
    };
    EventBus.on('return-to-overworld', this.returnToOverworldHandler);

    this.replayBattleHandler = () => {
      if (this.sceneData.mode === 'battle') {
        this.replayBattle();
      }
    };
    EventBus.on('replay-battle', this.replayBattleHandler);

    this.advanceFloorHandler = () => {
      if (this.sceneData.mode === 'battle') {
        this.advanceToNextFloor();
      }
    };
    EventBus.on('advance-to-next-floor', this.advanceFloorHandler);

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
      return;
    }

    const result = this.battleLoop.update(dt);
    EventBus.emit('battle-state-update', this.battleLoop.getState());

    if (!result) {
      return;
    }

    this.battleResult = result;
    const state = this.battleLoop.getState();
    const nextFloor = this.sceneData.floorNumber
      ? getNextPortalFloor(this.sceneData.floorNumber)
      : null;
    if (result === 'allied_win' && this.sceneData.floorNumber) {
      unlockPortalFloor(this.sceneData.floorNumber);
    }
    const summaryData: BattleSummaryData = {
      result,
      nodeId: state.nodeId,
      floorNumber: state.floorNumber,
      maxFloor: state.maxFloor,
      canAdvance: result === 'allied_win' && nextFloor !== null,
      nextFloor,
      durationSec: state.timeSec,
      alliedUnits: state.alliedUnits,
      enemyUnits: state.enemyUnits,
      heroes: state.heroes,
      allDamageEvents: this.battleLoop.getAllDamageEvents(),
      aiStats: this.battleLoop.getAIStats(),
    };
    EventBus.emit('battle-summary', summaryData);
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
    if (this.returnToOverworldHandler) {
      EventBus.removeListener('return-to-overworld', this.returnToOverworldHandler);
      this.returnToOverworldHandler = undefined;
    }
    if (this.replayBattleHandler) {
      EventBus.removeListener('replay-battle', this.replayBattleHandler);
      this.replayBattleHandler = undefined;
    }
    if (this.advanceFloorHandler) {
      EventBus.removeListener('advance-to-next-floor', this.advanceFloorHandler);
      this.advanceFloorHandler = undefined;
    }
    this.battleLoop.destroy();
  }

  private returnToOverworld(): void {
    this.cleanUp();
    this.scene.start('OverworldScene');
  }

  private replayBattle(): void {
    this.cleanUp();
    this.scene.restart(this.sceneData);
  }

  private advanceToNextFloor(): void {
    if (!this.sceneData.floorNumber) {
      return;
    }

    const nextFloor = getNextPortalFloor(this.sceneData.floorNumber);
    if (!nextFloor) {
      return;
    }

    this.cleanUp();
    this.scene.restart({
      ...this.sceneData,
      floorNumber: nextFloor,
      difficulty: getPortalFloorConfig(nextFloor).statMultiplier,
    });
  }

  private createMapLayout(mode: BattleMode): BattleMapLayout {
    const mapKey = mode === 'playground' ? 'playground-map' : 'battlefield-map';

    try {
      this.cameras.main.setBackgroundColor(mode === 'playground' ? '#2f4f5b' : '#3a6436');
      const map = createGroundTilemapLayer(this, mapKey, -22);
      const layout: BattleMapLayout = {
        mapSummary: {
          cols: map.width,
          rows: map.height,
          tileWidth: map.tileWidth,
          tileHeight: map.tileHeight,
          worldWidth: map.widthInPixels,
          worldHeight: map.heightInPixels,
        },
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

    const width = typeof object.width === 'number' ? object.width : 0;
    const height = typeof object.height === 'number' ? object.height : 0;
    return {
      x: object.x + width / 2,
      y: object.y + height / 2,
    };
  }
}
