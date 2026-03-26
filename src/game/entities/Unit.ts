import { Scene } from 'phaser';
import { UnitState, UnitFaction, UnitRole, UnitAnimState, Position } from '../types';
import { UNIT_CONFIGS } from '../data/units';
import { EventBus } from '../EventBus';

let unitIdCounter = 0;

export function createUnitState(
  faction: UnitFaction,
  role: UnitRole,
  position: Position,
  overrides: Partial<UnitState> = {}
): UnitState {
  const config = UNIT_CONFIGS[role];
  const baseState: UnitState = {
    id: `unit-${faction}-${role}-${unitIdCounter++}`,
    faction,
    role,
    position: { ...position },
    hp: config.hp,
    maxHp: config.hp,
    attack: config.attack,
    attackRange: config.attackRange,
    attackSpeed: config.attackSpeed,
    moveSpeed: config.moveSpeed,
    state: 'idle',
  };

  return {
    ...baseState,
    ...overrides,
    position: { ...position, ...(overrides.position ?? {}) },
    state: 'idle',
  };
}

export class Unit {
  state: UnitState;
  sprite: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  labelText?: Phaser.GameObjects.Text;
  private attackCooldown: number = 0;

  constructor(scene: Scene, unitState: UnitState) {
    this.state = unitState;

    const prefix = unitState.faction === 'allied' ? 'blue' : 'red';
    const textureKey = `${prefix}-${unitState.role}-idle`;

    this.sprite = scene.add.sprite(unitState.position.x, unitState.position.y, textureKey);
    this.sprite.setScale(0.5);
    this.sprite.play(`${prefix}-${unitState.role}-idle-anim`);
    if (unitState.isPassive) {
      this.sprite.setTint(0xffd27f);
    }

    // Flip enemy sprites to face left
    if (unitState.faction === 'enemy') {
      this.sprite.setFlipX(true);
    }

    this.hpBar = scene.add.graphics();
    this.updateHpBar();

    if (unitState.displayName) {
      this.labelText = scene.add.text(
        unitState.position.x,
        unitState.position.y - 66,
        unitState.displayName,
        {
          fontSize: '10px',
          color: unitState.isPassive ? '#ffd27f' : '#ffffff',
          fontFamily: 'monospace',
          backgroundColor: '#00000088',
          padding: { x: 4, y: 2 },
        }
      );
      this.labelText.setOrigin(0.5);
      this.labelText.setDepth(6);
    }

    // Make clickable for selection
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on('pointerdown', () => {
      EventBus.emit('unit-selected', this.state);
    });
  }

  get id(): string {
    return this.state.id;
  }

  isAlive(): boolean {
    return this.state.state !== 'dead' && this.state.hp > 0;
  }

  isPassive(): boolean {
    return this.state.isPassive === true;
  }

  distanceTo(other: Unit): number {
    const dx = this.state.position.x - other.state.position.x;
    const dy = this.state.position.y - other.state.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  moveToward(target: Position, dt: number): void {
    if (this.state.state === 'dead') return;

    const dx = target.x - this.state.position.x;
    const dy = target.y - this.state.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 2) return;

    const nx = dx / dist;
    const ny = dy / dist;
    const step = this.state.moveSpeed * dt;

    this.state.position.x += nx * Math.min(step, dist);
    this.state.position.y += ny * Math.min(step, dist);

    this.sprite.setPosition(this.state.position.x, this.state.position.y);
    this.setAnimState('moving');
  }

  canAttack(dt: number): boolean {
    this.attackCooldown -= dt;
    return this.attackCooldown <= 0;
  }

  performAttack(): number {
    this.attackCooldown = 1 / this.state.attackSpeed;
    this.setAnimState('attacking');
    return this.state.attack;
  }

  takeDamage(amount: number): void {
    if (this.state.state === 'dead') return;
    if (this.state.isInvulnerable) return;

    this.state.hp = Math.max(0, this.state.hp - amount);
    this.updateHpBar();

    if (this.state.hp <= 0) {
      this.state.state = 'dead';
      this.sprite.setAlpha(0.3);
      this.sprite.stop();
      this.hpBar.clear();
    }
  }

  setAnimState(newState: UnitAnimState): void {
    if (this.state.state === 'dead') return;
    if (this.state.state === newState) return;

    this.state.state = newState;
    const prefix = this.state.faction === 'allied' ? 'blue' : 'red';
    const role = this.state.role;

    switch (newState) {
      case 'idle':
        this.sprite.play(`${prefix}-${role}-idle-anim`, true);
        break;
      case 'moving':
        this.sprite.play(`${prefix}-${role}-run-anim`, true);
        break;
      case 'attacking':
        this.sprite.play(`${prefix}-${role}-attack-anim`, true);
        this.sprite.once('animationcomplete', () => {
          if (this.isAlive()) {
            this.setAnimState('idle');
          }
        });
        break;
    }
  }

  private updateHpBar(): void {
    this.hpBar.clear();

    const barWidth = 40;
    const barHeight = 5;
    const x = this.state.position.x - barWidth / 2;
    const y = this.state.position.y - 50;

    // Background
    this.hpBar.fillStyle(0x333333);
    this.hpBar.fillRect(x, y, barWidth, barHeight);

    // Fill
    const ratio = this.state.hp / this.state.maxHp;
    const color = ratio > 0.5 ? 0x00cc00 : ratio > 0.25 ? 0xcccc00 : 0xcc0000;
    this.hpBar.fillStyle(color);
    this.hpBar.fillRect(x, y, barWidth * ratio, barHeight);
  }

  syncVisuals(): void {
    this.sprite.setPosition(this.state.position.x, this.state.position.y);
    this.labelText?.setPosition(this.state.position.x, this.state.position.y - 66);
    this.updateHpBar();
  }

  destroy(): void {
    this.sprite.destroy();
    this.hpBar.destroy();
    this.labelText?.destroy();
  }
}
