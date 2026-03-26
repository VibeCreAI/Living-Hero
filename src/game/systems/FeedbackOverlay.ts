import { Scene } from 'phaser';
import { Hero } from '../entities/Hero';
import { Unit } from '../entities/Unit';
import { IntentType } from '../types';

const INTENT_COLORS: Record<IntentType, number> = {
  advance_to_point: 0xff6644,
  focus_enemy: 0xff4444,
  protect_target: 0x44aaff,
  hold_position: 0xffd700,
  retreat_to_point: 0x88ff88,
  use_skill: 0xaa66ff,
};

const INTENT_LABELS: Record<IntentType, string> = {
  advance_to_point: 'ADVANCING',
  focus_enemy: 'FOCUSING',
  protect_target: 'PROTECTING',
  hold_position: 'HOLDING',
  retreat_to_point: 'RETREATING',
  use_skill: 'SKILL',
};

/**
 * Draws visual feedback overlays on the battle scene:
 * - Line from hero to target/destination
 * - Highlight ring on targeted unit
 * - Intent color-coded label above hero
 */
export class FeedbackOverlay {
  private graphics: Phaser.GameObjects.Graphics;
  private targetRing: Phaser.GameObjects.Arc | null = null;
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(5);
  }

  update(
    heroes: Hero[],
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): void {
    this.graphics.clear();

    // Clean up old target ring
    this.targetRing?.destroy();
    this.targetRing = null;

    for (const hero of heroes) {
      const decision = hero.state.currentDecision;
      if (!decision) continue;

      const intent = decision.intent;
      const color = INTENT_COLORS[intent] ?? 0xffffff;

      // Update hero intent text with color-coded label
      const label = INTENT_LABELS[intent] ?? intent;
      hero.intentText.setText(label);
      hero.intentText.setColor(`#${color.toString(16).padStart(6, '0')}`);

      // Draw movement line to destination
      if (decision.moveTo) {
        this.graphics.lineStyle(1.5, color, 0.4);
        this.graphics.beginPath();
        this.graphics.moveTo(hero.state.position.x, hero.state.position.y);
        this.graphics.lineTo(decision.moveTo.x, decision.moveTo.y);
        this.graphics.strokePath();

        // Small diamond at destination
        const dx = decision.moveTo.x;
        const dy = decision.moveTo.y;
        this.graphics.fillStyle(color, 0.5);
        this.graphics.fillTriangle(dx, dy - 5, dx - 4, dy, dx + 4, dy);
        this.graphics.fillTriangle(dx, dy + 5, dx - 4, dy, dx + 4, dy);
      }

      // Highlight targeted unit
      if (decision.targetId) {
        const allUnits = [...alliedUnits, ...enemyUnits];
        const target = allUnits.find(
          (u) => u.id === decision.targetId && u.isAlive()
        );
        if (target) {
          this.targetRing = this.scene.add.circle(
            target.state.position.x,
            target.state.position.y,
            30
          );
          this.targetRing.setStrokeStyle(2, color, 0.6);
          this.targetRing.setFillStyle(color, 0.08);
          this.targetRing.setDepth(4);
        }
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.targetRing?.destroy();
  }
}
