import { Scene } from 'phaser';
import { HeroState, HeroConfig, HeroDecision, Position } from '../types';
import { EventBus } from '../EventBus';

const PORTRAIT_Y_OFFSET = 52;
const NAME_Y_OFFSET = 26;
const INTENT_Y_OFFSET = 88;

export function createHeroState(config: HeroConfig, position: Position): HeroState {
  return {
    id: config.id,
    name: config.name,
    position: { ...position },
    traits: { ...config.traits },
  };
}

export class Hero {
  state: HeroState;
  marker: Phaser.GameObjects.Arc;
  pulseRing: Phaser.GameObjects.Arc;
  portraitShadow: Phaser.GameObjects.Arc;
  portraitFrame: Phaser.GameObjects.Arc;
  portrait: Phaser.GameObjects.Image;
  intentText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  private portraitMaskSource: Phaser.GameObjects.Graphics;
  private portraitMask: Phaser.Display.Masks.GeometryMask;

  constructor(scene: Scene, heroState: HeroState) {
    this.state = heroState;

    this.marker = scene.add.circle(heroState.position.x, heroState.position.y, 22);
    this.marker.setStrokeStyle(2, 0xf5d06b, 0.95);
    this.marker.setFillStyle(0x000000, 0);
    this.marker.setDepth(-1);
    this.marker.setInteractive({ useHandCursor: true });
    this.marker.on('pointerdown', () => {
      EventBus.emit('hero-selected', this.state);
    });

    this.pulseRing = scene.add.circle(heroState.position.x, heroState.position.y, 22);
    this.pulseRing.setStrokeStyle(1.5, 0xf5d06b, 0.45);
    this.pulseRing.setFillStyle(0x000000, 0);
    this.pulseRing.setDepth(-1);
    scene.tweens.add({
      targets: this.pulseRing,
      scaleX: 1.45,
      scaleY: 1.45,
      alpha: 0,
      duration: 1200,
      ease: 'Sine.Out',
      repeat: -1,
    });

    this.portraitShadow = scene.add.circle(
      heroState.position.x,
      heroState.position.y - PORTRAIT_Y_OFFSET + 2,
      18,
      0x000000,
      0.35
    );
    this.portraitShadow.setDepth(7);

    this.portraitFrame = scene.add.circle(
      heroState.position.x,
      heroState.position.y - PORTRAIT_Y_OFFSET,
      18,
      0x1b2733,
      1
    );
    this.portraitFrame.setStrokeStyle(2, 0xf5d06b, 1);
    this.portraitFrame.setDepth(8);
    this.portraitFrame.setInteractive({ useHandCursor: true });
    this.portraitFrame.on('pointerdown', () => {
      EventBus.emit('hero-selected', this.state);
    });

    this.portrait = scene.add.image(
      heroState.position.x,
      heroState.position.y - PORTRAIT_Y_OFFSET,
      'commander-portrait'
    );
    this.portrait.setDisplaySize(30, 30);
    this.portrait.setDepth(9);

    this.portraitMaskSource = scene.add.graphics({ x: 0, y: 0 });
    this.portraitMaskSource.setVisible(false);
    this.portraitMask = this.portraitMaskSource.createGeometryMask();
    this.portrait.setMask(this.portraitMask);
    this.updatePortraitMask(heroState.position);

    this.nameText = scene.add.text(
      heroState.position.x,
      heroState.position.y - NAME_Y_OFFSET,
      heroState.name,
      {
        fontSize: '11px',
        color: '#f7e08c',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        stroke: '#172016',
        strokeThickness: 3,
        backgroundColor: '#10170fcc',
        padding: { x: 4, y: 2 },
      }
    );
    this.nameText.setOrigin(0.5);
    this.nameText.setResolution(2);
    this.nameText.setDepth(10);

    this.intentText = scene.add.text(
      heroState.position.x,
      heroState.position.y - INTENT_Y_OFFSET,
      'Awaiting orders...',
      {
        fontSize: '11px',
        color: '#edf2d4',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        stroke: '#172016',
        strokeThickness: 3,
        backgroundColor: '#10170fcc',
        padding: { x: 5, y: 2 },
      }
    );
    this.intentText.setOrigin(0.5);
    this.intentText.setResolution(2);
    this.intentText.setDepth(10);
  }

  setDirective(directive: string): void {
    this.state.currentDirective = directive;
  }

  setDecision(decision: HeroDecision): void {
    this.state.currentDecision = decision;
    this.updateIntentDisplay();
  }

  private updateIntentDisplay(): void {
    const decision = this.state.currentDecision;
    if (decision) {
      const label = decision.rationaleTag.replace(/_/g, ' ');
      this.intentText.setText(label);
    }
  }

  setPosition(pos: Position): void {
    this.state.position = { ...pos };
    this.marker.setPosition(pos.x, pos.y);
    this.pulseRing.setPosition(pos.x, pos.y);
    this.portraitShadow.setPosition(pos.x, pos.y - PORTRAIT_Y_OFFSET + 2);
    this.portraitFrame.setPosition(pos.x, pos.y - PORTRAIT_Y_OFFSET);
    this.portrait.setPosition(pos.x, pos.y - PORTRAIT_Y_OFFSET);
    this.nameText.setPosition(pos.x, pos.y - NAME_Y_OFFSET);
    this.intentText.setPosition(pos.x, pos.y - INTENT_Y_OFFSET);
    this.updatePortraitMask(pos);
  }

  destroy(): void {
    this.marker.destroy();
    this.pulseRing.destroy();
    this.portraitShadow.destroy();
    this.portraitFrame.destroy();
    this.portrait.clearMask();
    this.portrait.destroy();
    this.intentText.destroy();
    this.nameText.destroy();
    this.portraitMask.destroy();
    this.portraitMaskSource.destroy();
  }

  private updatePortraitMask(pos: Position): void {
    this.portraitMaskSource.clear();
    this.portraitMaskSource.fillStyle(0xffffff);
    this.portraitMaskSource.fillCircle(pos.x, pos.y - PORTRAIT_Y_OFFSET, 15);
  }
}
