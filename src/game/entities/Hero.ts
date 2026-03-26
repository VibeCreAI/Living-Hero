import { Scene } from 'phaser';
import { HeroState, HeroConfig, HeroDecision, Position } from '../types';
import { EventBus } from '../EventBus';

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
  intentText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;

  constructor(scene: Scene, heroState: HeroState) {
    this.state = heroState;

    // Hero marker: golden circle
    this.marker = scene.add.circle(
      heroState.position.x,
      heroState.position.y,
      16,
      0xffd700
    );
    this.marker.setStrokeStyle(2, 0x000000);
    this.marker.setDepth(10);
    this.marker.setInteractive({ useHandCursor: true });
    this.marker.on('pointerdown', () => {
      EventBus.emit('hero-selected', this.state);
    });

    // Name label
    this.nameText = scene.add.text(
      heroState.position.x,
      heroState.position.y - 30,
      heroState.name,
      { fontSize: '12px', color: '#ffd700', fontFamily: 'monospace' }
    );
    this.nameText.setOrigin(0.5);
    this.nameText.setDepth(10);

    // Intent display
    this.intentText = scene.add.text(
      heroState.position.x,
      heroState.position.y + 24,
      'Awaiting orders...',
      { fontSize: '10px', color: '#ffffff', fontFamily: 'monospace', backgroundColor: '#00000088', padding: { x: 4, y: 2 } }
    );
    this.intentText.setOrigin(0.5);
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
    this.nameText.setPosition(pos.x, pos.y - 30);
    this.intentText.setPosition(pos.x, pos.y + 24);
  }

  destroy(): void {
    this.marker.destroy();
    this.intentText.destroy();
    this.nameText.destroy();
  }
}
