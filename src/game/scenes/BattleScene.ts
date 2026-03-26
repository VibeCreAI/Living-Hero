import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { BattleLoop } from '../systems/BattleLoop';
import { BattleResult, BattleMode } from '../types';

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
    this.cameras.main.setBackgroundColor(isPlayground ? '#2b4a54' : '#3a6b35');

    this.add
      .text(512, 20, isPlayground ? 'PLAYGROUND' : 'BATTLE', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.add
      .text(100, 60, 'ALLIES', {
        fontSize: '14px',
        color: '#4488ff',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.add
      .text(850, 60, isPlayground ? 'TARGETS' : 'ENEMIES', {
        fontSize: '14px',
        color: isPlayground ? '#ffcc66' : '#ff4444',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

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
          fontFamily: 'monospace',
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
            fontFamily: 'monospace',
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
        fontFamily: 'monospace',
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
        fontFamily: 'monospace',
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
}
