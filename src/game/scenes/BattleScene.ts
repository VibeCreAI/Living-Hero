import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { BattleLoop } from '../systems/BattleLoop';
import { BattleResult, PlayerCommand, CommandType } from '../types';

interface BattleSceneData {
  nodeId: string;
  difficulty: number;
}

export class BattleScene extends Scene {
  private battleLoop!: BattleLoop;
  private battleResult: BattleResult = null;
  private returnTimer: number = 0;
  private commandText!: Phaser.GameObjects.Text;
  private sceneData: BattleSceneData = { nodeId: '', difficulty: 1 };

  constructor() {
    super('BattleScene');
  }

  init(data: BattleSceneData): void {
    this.sceneData = data;
    this.battleResult = null;
    this.returnTimer = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#3a6b35');

    // Title
    this.add.text(512, 20, 'BATTLE', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Side labels
    this.add.text(100, 60, 'ALLIES', {
      fontSize: '14px',
      color: '#4488ff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(850, 60, 'ENEMIES', {
      fontSize: '14px',
      color: '#ff4444',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Command display
    this.commandText = this.add.text(512, 750, 'Command: ADVANCE | 1:Advance 2:Hold 3:Protect 4:Focus', {
      fontSize: '12px',
      color: '#cccccc',
      fontFamily: 'monospace',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5);

    // Initialize battle
    this.battleLoop = new BattleLoop();
    this.battleLoop.init(this, { difficulty: this.sceneData.difficulty });

    // Keyboard commands
    this.input.keyboard!.on('keydown-ONE', () => this.issueCommand('advance'));
    this.input.keyboard!.on('keydown-TWO', () => this.issueCommand('hold'));
    this.input.keyboard!.on('keydown-THREE', () => this.issueCommand('protect'));
    this.input.keyboard!.on('keydown-FOUR', () => this.issueCommand('focus'));

    // Listen for commands from React UI
    EventBus.on('player-command', (cmd: PlayerCommand) => {
      this.battleLoop.setCommand(cmd);
      this.commandText.setText(`Command: ${cmd.type.toUpperCase()}`);
    });

    EventBus.emit('current-scene-ready', this);
    EventBus.emit('battle-started', this.battleLoop.getState());
  }

  private issueCommand(type: CommandType): void {
    const cmd: PlayerCommand = { type };

    // For focus: target the first alive enemy
    if (type === 'focus') {
      const firstEnemy = this.battleLoop.enemyUnits.find((u) => u.isAlive());
      if (firstEnemy) {
        cmd.targetId = firstEnemy.id;
      }
    }

    this.battleLoop.setCommand(cmd);
    this.commandText.setText(`Command: ${type.toUpperCase()}`);
    EventBus.emit('command-issued', cmd);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    if (this.battleResult) {
      this.returnTimer += dt;
      if (this.returnTimer >= 3) {
        this.cleanUp();
        this.scene.start('OverworldScene');
      }
      return;
    }

    const result = this.battleLoop.update(dt);

    // Emit state for React HUD
    EventBus.emit('battle-state-update', this.battleLoop.getState());

    if (result) {
      this.battleResult = result;
      const isWin = result === 'allied_win';

      this.add.text(
        512, 384,
        isWin ? 'VICTORY!' : 'DEFEAT!',
        {
          fontSize: '48px',
          color: isWin ? '#00ff00' : '#ff0000',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 4,
        }
      ).setOrigin(0.5).setDepth(100);

      this.add.text(512, 430, 'Returning to overworld...', {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(100);

      EventBus.emit('battle-ended', result);
    }
  }

  private cleanUp(): void {
    EventBus.removeListener('player-command');
    this.battleLoop.destroy();
  }
}
