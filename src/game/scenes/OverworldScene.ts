import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { OVERWORLD_NODES } from '../data/terrain';
import { OverworldNode } from '../types';

export class OverworldScene extends Scene {
  private heroSprite!: Phaser.GameObjects.Arc;
  private heroNameText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private promptText!: Phaser.GameObjects.Text;
  private nearNode: OverworldNode | null = null;
  private nodeSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private heroPos = { x: 120, y: 400 };
  private readonly HERO_SPEED = 200;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('OverworldScene');
  }

  create(): void {
    // Green background
    this.cameras.main.setBackgroundColor('#2d5a27');

    // Title
    this.add.text(512, 30, 'OVERWORLD', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Draw encounter nodes
    for (const node of OVERWORLD_NODES) {
      const castle = this.add.image(node.position.x, node.position.y, 'castle-red');
      castle.setScale(0.4);
      this.nodeSprites.set(node.id, castle);

      // Label
      this.add.text(node.position.x, node.position.y + 50, node.label, {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: 'monospace',
        backgroundColor: '#00000088',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5);

      // Difficulty indicator
      const stars = '\u2605'.repeat(Math.ceil(node.difficulty));
      this.add.text(node.position.x, node.position.y + 66, stars, {
        fontSize: '12px',
        color: '#ffcc00',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    // Hero sprite (golden circle)
    this.heroSprite = this.add.circle(this.heroPos.x, this.heroPos.y, 18, 0xffd700);
    this.heroSprite.setStrokeStyle(3, 0x000000);
    this.heroSprite.setDepth(5);

    this.heroNameText = this.add.text(this.heroPos.x, this.heroPos.y - 28, 'Commander', {
      fontSize: '11px',
      color: '#ffd700',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(5);

    // Prompt text (hidden by default)
    this.promptText = this.add.text(512, 720, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setVisible(false);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Instructions
    this.add.text(512, 740, 'Arrow keys to move | SPACE to enter battle', {
      fontSize: '11px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    EventBus.emit('current-scene-ready', this);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown) dx -= 1;
    if (this.cursors.right.isDown) dx += 1;
    if (this.cursors.up.isDown) dy -= 1;
    if (this.cursors.down.isDown) dy += 1;

    // Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    this.heroPos.x += dx * this.HERO_SPEED * dt;
    this.heroPos.y += dy * this.HERO_SPEED * dt;

    // Clamp to bounds
    this.heroPos.x = Phaser.Math.Clamp(this.heroPos.x, 30, 994);
    this.heroPos.y = Phaser.Math.Clamp(this.heroPos.y, 30, 700);

    this.heroSprite.setPosition(this.heroPos.x, this.heroPos.y);
    this.heroNameText.setPosition(this.heroPos.x, this.heroPos.y - 28);

    // Check proximity to nodes
    this.nearNode = null;
    for (const node of OVERWORLD_NODES) {
      const dx2 = this.heroPos.x - node.position.x;
      const dy2 = this.heroPos.y - node.position.y;
      const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      if (dist < 70) {
        this.nearNode = node;
        break;
      }
    }

    if (this.nearNode) {
      this.promptText.setText(`Press SPACE to enter: ${this.nearNode.label}`);
      this.promptText.setVisible(true);

      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.scene.start('BattleScene', {
          nodeId: this.nearNode.id,
          difficulty: this.nearNode.difficulty,
        });
      }
    } else {
      this.promptText.setVisible(false);
    }

    // Emit hero position for React UI
    EventBus.emit('overworld-update', {
      heroPosition: { ...this.heroPos },
      nearNode: this.nearNode?.label ?? null,
    });
  }
}
