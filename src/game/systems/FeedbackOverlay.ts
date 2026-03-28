import { Scene } from 'phaser';
import { Hero } from '../entities/Hero';
import { Unit } from '../entities/Unit';
import { DamageEvent, IntentType, UnitFaction } from '../types';

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

export class FeedbackOverlay {
  private graphics: Phaser.GameObjects.Graphics;
  private scene: Scene;
  private floatingTexts = new Set<Phaser.GameObjects.Text>();
  private projectiles = new Set<Phaser.GameObjects.Image>();

  constructor(scene: Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(5);
    scene.textures.get('blue-archer-arrow')?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    scene.textures.get('red-archer-arrow')?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  showDamageEvents(events: DamageEvent[], units: Unit[]): void {
    if (events.length === 0) {
      return;
    }

    const unitsById = new Map(units.map((unit) => [unit.id, unit]));
    for (const event of events) {
      const attacker = unitsById.get(event.attackerId);
      const target = unitsById.get(event.targetId);
      if (!target) {
        continue;
      }

      if (attacker && event.attackerRole === 'archer') {
        this.spawnArrowProjectile(attacker, target, event.attackerFaction);
      }

      target.flashDamage();
      this.spawnDamageNumber(target, event.damage, event.targetFaction);
    }
  }

  update(heroes: Hero[], alliedUnits: Unit[], enemyUnits: Unit[]): void {
    this.graphics.clear();

    const allUnits = [...alliedUnits, ...enemyUnits];
    const pulse = (Math.sin(this.scene.time.now / 180) + 1) * 0.5;

    for (const hero of heroes) {
      const decision = hero.state.currentDecision;
      if (!decision) continue;

      const intent = decision.intent;
      const color = INTENT_COLORS[intent] ?? 0xffffff;

      const label = INTENT_LABELS[intent] ?? intent;
      hero.intentText.setText(label);
      hero.intentText.setColor(`#${color.toString(16).padStart(6, '0')}`);

      if (decision.moveTo) {
        this.graphics.lineStyle(1.5, color, 0.4);
        this.graphics.beginPath();
        this.graphics.moveTo(hero.state.position.x, hero.state.position.y);
        this.graphics.lineTo(decision.moveTo.x, decision.moveTo.y);
        this.graphics.strokePath();

        const radius = 18 + pulse * 8;
        this.graphics.lineStyle(2, color, 0.65);
        this.graphics.strokeCircle(decision.moveTo.x, decision.moveTo.y, radius);
        this.graphics.fillStyle(color, 0.12);
        this.graphics.fillCircle(decision.moveTo.x, decision.moveTo.y, 10 + pulse * 3);
      }

      if (decision.targetId) {
        const target = allUnits.find((u) => u.id === decision.targetId && u.isAlive());
        if (target) {
          const radius = 28 + pulse * 6;
          this.graphics.lineStyle(2, color, 0.75);
          this.graphics.strokeCircle(target.state.position.x, target.state.position.y, radius);
          this.graphics.fillStyle(color, 0.08);
          this.graphics.fillCircle(target.state.position.x, target.state.position.y, 18);
        }
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
    for (const projectile of this.projectiles) {
      projectile.destroy();
    }
    this.projectiles.clear();
    for (const text of this.floatingTexts) {
      text.destroy();
    }
    this.floatingTexts.clear();
  }

  private spawnArrowProjectile(attacker: Unit, target: Unit, attackerFaction: UnitFaction): void {
    const texture = attackerFaction === 'enemy' ? 'red-archer-arrow' : 'blue-archer-arrow';
    const startX = attacker.state.position.x;
    const startY = attacker.state.position.y - 20;
    const endX = target.state.position.x;
    const endY = target.state.position.y - 18;
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    if (distance < 4) {
      return;
    }

    const arrow = this.scene.add.image(startX, startY, texture);
    arrow.setOrigin(0.2, 0.5);
    arrow.setScale(0.5);
    arrow.setDepth(5.7);
    arrow.setRotation(Math.atan2(dy, dx));
    this.projectiles.add(arrow);

    const duration = Phaser.Math.Clamp(Math.round((distance / 900) * 1000), 100, 320);
    this.scene.tweens.add({
      targets: arrow,
      x: endX,
      y: endY,
      duration,
      ease: 'Linear',
      onComplete: () => {
        this.projectiles.delete(arrow);
        arrow.destroy();
      },
    });
  }

  private spawnDamageNumber(target: Unit, damage: number, targetFaction: 'allied' | 'enemy'): void {
    const color = targetFaction === 'allied' ? '#ff8f80' : '#ffd166';
    const startX = target.state.position.x + Phaser.Math.Between(-8, 8);
    const startY = target.state.position.y - 62;
    const text = this.scene.add.text(startX, startY, `-${damage}`, {
      fontSize: '18px',
      fontFamily: '"NeoDunggeunmoPro", monospace',
      fontStyle: 'bold',
      color,
      stroke: '#1a1200',
      strokeThickness: 4,
    });
    text.setOrigin(0.5);
    text.setDepth(8);
    this.floatingTexts.add(text);

    this.scene.tweens.add({
      targets: text,
      y: startY - 28,
      alpha: 0,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 650,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.floatingTexts.delete(text);
        text.destroy();
      },
    });
  }
}
