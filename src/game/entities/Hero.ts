import { Scene } from 'phaser';
import { HeroState, HeroConfig, HeroDecision, Position, TileCoord } from '../types';
import { EventBus } from '../EventBus';
import { Unit } from './Unit';

const NAME_Y_OFFSET = 78;
const INTENT_Y_OFFSET = 96;
const SPEECH_Y_OFFSET = 148;
const SPEECH_MAX_WIDTH = 220;
const SPEECH_PADDING_X = 10;
const SPEECH_PADDING_Y = 8;
const SPEECH_DURATION_MS = 5000;
const MAP_PADDING = 20;
const MAP_WIDTH = 1024;
const MAP_HEIGHT = 768;

export function createHeroState(
  config: HeroConfig,
  combatUnitId: string,
  tile: TileCoord,
  position: Position
): HeroState {
  return {
    id: config.id,
    name: config.name,
    combatUnitId,
    tile: { ...tile },
    position: { ...position },
    traits: { ...config.traits },
  };
}

export class Hero {
  state: HeroState;
  combatUnit: Unit;
  intentText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  private scene: Scene;
  private speechBubble: Phaser.GameObjects.Graphics;
  private speechText: Phaser.GameObjects.Text;
  private speechExpiresAt = 0;

  constructor(scene: Scene, heroState: HeroState, combatUnit: Unit) {
    this.scene = scene;
    this.state = heroState;
    this.combatUnit = combatUnit;

    this.nameText = scene.add.text(heroState.position.x, heroState.position.y - NAME_Y_OFFSET, heroState.name, {
      fontSize: '11px',
      color: '#f7e08c',
      fontFamily: '"NeoDunggeunmoPro", monospace',
      stroke: '#172016',
      strokeThickness: 3,
      backgroundColor: '#10170fcc',
      padding: { x: 4, y: 2 },
    });
    this.nameText.setOrigin(0.5);
    this.nameText.setResolution(2);
    this.nameText.setDepth(10);

    this.intentText = scene.add.text(heroState.position.x, heroState.position.y - INTENT_Y_OFFSET, 'Awaiting orders...', {
      fontSize: '11px',
      color: '#edf2d4',
      fontFamily: '"NeoDunggeunmoPro", monospace',
      stroke: '#172016',
      strokeThickness: 3,
      backgroundColor: '#10170fcc',
      padding: { x: 5, y: 2 },
    });
    this.intentText.setOrigin(0.5);
    this.intentText.setResolution(2);
    this.intentText.setDepth(10);

    this.speechBubble = scene.add.graphics();
    this.speechBubble.setDepth(11);

    this.speechText = scene.add.text(heroState.position.x, heroState.position.y - SPEECH_Y_OFFSET, '', {
      fontSize: '11px',
      color: '#f6f7ef',
      fontFamily: '"NeoDunggeunmoPro", monospace',
      align: 'center',
      wordWrap: { width: SPEECH_MAX_WIDTH, useAdvancedWrap: true },
    });
    this.speechText.setOrigin(0.5);
    this.speechText.setResolution(2);
    this.speechText.setDepth(12);
    this.speechText.setVisible(false);

    this.combatUnit.setSelectionHandler(() => {
      EventBus.emit('hero-selected', this.state);
    });

    this.syncVisuals();
  }

  setDirective(directive: string): void {
    this.state.currentDirective = directive;
  }

  setDecision(decision: HeroDecision): void {
    this.state.currentDecision = decision;
    this.updateIntentDisplay();
  }

  setSpeech(message: string): void {
    const text = message.trim();
    if (!text) {
      this.hideSpeech();
      return;
    }

    this.speechExpiresAt = this.scene.time.now + SPEECH_DURATION_MS;
    this.speechText.setText(text);
    this.speechText.setVisible(true);
    this.redrawSpeechBubble();
  }

  syncVisuals(): void {
    const pos = this.combatUnit.state.position;
    const tile = this.combatUnit.state.tile;
    this.state.tile = { ...tile };
    this.state.position = { ...pos };
    this.nameText.setPosition(pos.x, pos.y - NAME_Y_OFFSET);
    this.intentText.setPosition(pos.x, pos.y - INTENT_Y_OFFSET);

    if (this.speechText.visible) {
      if (this.scene.time.now >= this.speechExpiresAt) {
        this.hideSpeech();
      } else {
        this.redrawSpeechBubble();
      }
    }
  }

  destroy(): void {
    this.intentText.destroy();
    this.nameText.destroy();
    this.speechBubble.destroy();
    this.speechText.destroy();
  }

  private updateIntentDisplay(): void {
    const decision = this.state.currentDecision;
    if (!decision) {
      this.intentText.setText('Awaiting orders...');
      this.intentText.setColor('#edf2d4');
      return;
    }

    const label = decision.rationaleTag.replace(/_/g, ' ');
    this.intentText.setText(label);
  }

  private redrawSpeechBubble(): void {
    const anchor = this.getSpeechAnchor();
    this.speechText.setPosition(anchor.x, anchor.y);

    const bounds = this.speechText.getBounds();
    const width = bounds.width + SPEECH_PADDING_X * 2;
    const height = bounds.height + SPEECH_PADDING_Y * 2;
    const left = anchor.x - width / 2;
    const top = anchor.y - height / 2;
    const tailY = top + height;

    this.speechBubble.clear();
    this.speechBubble.fillStyle(0x10170f, 0.72);
    this.speechBubble.lineStyle(1, 0xf5d06b, 0.5);
    this.speechBubble.fillRoundedRect(left, top, width, height, 10);
    this.speechBubble.strokeRoundedRect(left, top, width, height, 10);
    this.speechBubble.fillTriangle(anchor.x - 8, tailY - 1, anchor.x + 8, tailY - 1, anchor.x, tailY + 10);
    this.speechBubble.lineBetween(anchor.x - 8, tailY - 1, anchor.x, tailY + 10);
    this.speechBubble.lineBetween(anchor.x + 8, tailY - 1, anchor.x, tailY + 10);
  }

  private hideSpeech(): void {
    this.speechExpiresAt = 0;
    this.speechBubble.clear();
    this.speechText.setText('');
    this.speechText.setVisible(false);
  }

  private getSpeechAnchor(): Position {
    const pos = this.state.position;
    return {
      x: Phaser.Math.Clamp(pos.x, MAP_PADDING + 120, MAP_WIDTH - MAP_PADDING - 120),
      y: Phaser.Math.Clamp(pos.y - SPEECH_Y_OFFSET, MAP_PADDING + 36, MAP_HEIGHT - MAP_PADDING - 120),
    };
  }
}
