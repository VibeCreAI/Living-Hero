import { Scene } from 'phaser';
import { UnitState, UnitFaction, UnitRole, UnitAnimState, Position, TileCoord } from '../types';
import { UNIT_CONFIGS } from '../data/units';
import { getEnemyVariantDefinition } from '../data/enemyVariants';
import { EventBus } from '../EventBus';

let unitIdCounter = 0;
const HP_BAR_Y_OFFSET = 50;
const HP_BAR_SCALE = 0.6;
const HP_BAR_TOTAL_WIDTH = 45;
const HP_BAR_FILL_INSET_SCENE = 6;
const HP_BAR_BASE_CAP_SOURCE_WIDTH = 15;
const HP_BAR_BASE_CENTER_TILE_SOURCE_WIDTH = 64;
const HP_BAR_BASE_SOURCE_HEIGHT = 19;
const HP_BAR_FILL_SOURCE_HEIGHT = 3;
const HP_BAR_FILL_MAX_SCENE_WIDTH = HP_BAR_TOTAL_WIDTH - HP_BAR_FILL_INSET_SCENE * 2;
const HP_BAR_TEXTURE_BASE = 'ui-smallbar-base';
const HP_BAR_TEXTURE_FILL = 'ui-smallbar-fill';

const BIGBAR_BASE_LEFT_FRAME = 'ui-bigbar-base-left';
const BIGBAR_BASE_CENTER_FRAME = 'ui-bigbar-base-center';
const BIGBAR_BASE_RIGHT_FRAME = 'ui-bigbar-base-right';
const BIGBAR_FILL_FRAME = 'ui-bigbar-fill-strip';

interface UnitOptions {
  selectionHandler?: (state: UnitState) => void;
}

export function createUnitState(
  faction: UnitFaction,
  role: UnitRole,
  tile: TileCoord,
  position: Position,
  overrides: Partial<UnitState> = {}
): UnitState {
  const config = UNIT_CONFIGS[role];
  const baseState: UnitState = {
    id: `unit-${faction}-${role}-${unitIdCounter++}`,
    faction,
    role,
    tile: { ...tile },
    position: { ...position },
    hp: config.hp,
    maxHp: config.hp,
    attack: config.attack,
    attackRange: config.attackRange,
    attackSpeed: config.attackSpeed,
    moveSpeed: config.moveSpeed,
    state: 'idle',
  };

  const mergedState: UnitState = {
    ...baseState,
    ...overrides,
    tile: { ...tile, ...(overrides.tile ?? {}) },
    position: { ...position, ...(overrides.position ?? {}) },
    state: 'idle',
  };

  if (!mergedState.displayName && mergedState.variantId) {
    mergedState.displayName = getEnemyVariantDefinition(mergedState.variantId).displayName;
  }

  return mergedState;
}

export class Unit {
  state: UnitState;
  sprite: Phaser.GameObjects.Sprite;
  hpBarBaseLeft: Phaser.GameObjects.Image;
  hpBarBaseCenter: Phaser.GameObjects.TileSprite;
  hpBarBaseRight: Phaser.GameObjects.Image;
  hpBarFill: Phaser.GameObjects.TileSprite;
  labelText?: Phaser.GameObjects.Text;
  private scene: Scene;
  private attackCooldown: number = 0;
  private damageFlashToken = 0;
  private readonly baseScale: number;
  private readonly hpBarYOffset: number;
  private readonly labelYOffset: number;
  private persistentTint?: number;
  private facingFlipX: boolean;

  constructor(scene: Scene, unitState: UnitState, options: UnitOptions = {}) {
    this.scene = scene;
    this.state = unitState;
    this.baseScale = resolveBaseScale(unitState);
    this.hpBarYOffset = unitState.role === 'hero' ? 64 : HP_BAR_Y_OFFSET;
    this.labelYOffset = unitState.role === 'hero' ? 82 : 66;

    const animationPrefix = getAnimationPrefix(unitState);
    const textureKey = `${animationPrefix}-idle`;

    this.sprite = scene.add.sprite(unitState.position.x, unitState.position.y, textureKey);
    this.sprite.setScale(this.baseScale);
    this.sprite.play(`${animationPrefix}-idle-anim`);
    this.facingFlipX = unitState.faction === 'enemy';
    this.sprite.setFlipX(this.facingFlipX);
    if (unitState.isPassive) {
      this.persistentTint = 0xffd27f;
      this.applyPersistentTint();
    }

    this.ensureHpBarFrames(scene);
    scene.textures.get(HP_BAR_TEXTURE_BASE)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    scene.textures.get(HP_BAR_TEXTURE_FILL)?.setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.hpBarBaseLeft = scene.add.image(
      unitState.position.x,
      unitState.position.y - this.hpBarYOffset,
      HP_BAR_TEXTURE_BASE,
      BIGBAR_BASE_LEFT_FRAME
    );
    this.hpBarBaseLeft.setOrigin(0, 0.5);
    this.hpBarBaseLeft.setScale(HP_BAR_SCALE);
    this.hpBarBaseLeft.setDepth(5.9);

    this.hpBarBaseCenter = scene.add.tileSprite(
      unitState.position.x,
      unitState.position.y - this.hpBarYOffset,
      HP_BAR_BASE_CENTER_TILE_SOURCE_WIDTH,
      HP_BAR_BASE_SOURCE_HEIGHT,
      HP_BAR_TEXTURE_BASE,
      BIGBAR_BASE_CENTER_FRAME
    );
    this.hpBarBaseCenter.setOrigin(0, 0.5);
    this.hpBarBaseCenter.setScale(HP_BAR_SCALE);
    this.hpBarBaseCenter.setDepth(5.88);

    this.hpBarBaseRight = scene.add.image(
      unitState.position.x,
      unitState.position.y - this.hpBarYOffset,
      HP_BAR_TEXTURE_BASE,
      BIGBAR_BASE_RIGHT_FRAME
    );
    this.hpBarBaseRight.setOrigin(0, 0.5);
    this.hpBarBaseRight.setScale(HP_BAR_SCALE);
    this.hpBarBaseRight.setDepth(5.9);

    this.hpBarFill = scene.add.tileSprite(
      unitState.position.x,
      unitState.position.y - this.hpBarYOffset,
      HP_BAR_FILL_MAX_SCENE_WIDTH / HP_BAR_SCALE,
      HP_BAR_FILL_SOURCE_HEIGHT,
      HP_BAR_TEXTURE_FILL,
      BIGBAR_FILL_FRAME
    );
    this.hpBarFill.setOrigin(0, 0.5);
    this.hpBarFill.setScale(HP_BAR_SCALE);
    this.hpBarFill.setDepth(6);
    this.updateHpBar();

    if (unitState.displayName) {
      this.labelText = scene.add.text(
        unitState.position.x,
        unitState.position.y - this.labelYOffset,
        unitState.displayName,
        {
          fontSize: '10px',
          color:
            unitState.role === 'hero'
              ? '#ffd700'
              : unitState.isPassive
                ? '#ffd27f'
                : '#ffffff',
          fontFamily: '"NeoDunggeunmoPro", monospace',
          backgroundColor: '#00000088',
          padding: { x: 4, y: 2 },
        }
      );
      this.labelText.setOrigin(0.5);
      this.labelText.setDepth(6);
    }

    // Make clickable for selection
    this.sprite.setInteractive({ useHandCursor: true });
    this.setSelectionHandler(options.selectionHandler);
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

    this.updateFacingFromDelta(dx);

    const nx = dx / dist;
    const ny = dy / dist;
    const step = this.state.moveSpeed * dt;

    this.state.position.x += nx * Math.min(step, dist);
    this.state.position.y += ny * Math.min(step, dist);

    this.sprite.setPosition(this.state.position.x, this.state.position.y);
    this.setAnimState('moving');
  }

  setTilePosition(tile: TileCoord, position: Position): void {
    this.state.tile = { ...tile };
    this.state.position = { ...position };
    this.sprite.setPosition(position.x, position.y);
  }

  updateFacingFromDelta(deltaX: number): void {
    if (this.state.state === 'dead') {
      return;
    }

    if (Math.abs(deltaX) < 0.5) {
      return;
    }

    const shouldFlipX = deltaX < 0;
    if (shouldFlipX === this.facingFlipX) {
      return;
    }

    this.facingFlipX = shouldFlipX;
    this.sprite.setFlipX(shouldFlipX);
  }

  faceToward(target: Position): void {
    this.updateFacingFromDelta(target.x - this.state.position.x);
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

  takeDamage(amount: number): number {
    if (this.state.state === 'dead') return 0;
    if (this.state.isInvulnerable) return 0;

    const appliedDamage = Math.min(amount, this.state.hp);
    if (appliedDamage <= 0) {
      return 0;
    }

    this.state.hp = Math.max(0, this.state.hp - appliedDamage);
    this.updateHpBar();

    if (this.state.hp <= 0) {
      this.state.state = 'dead';
      this.sprite.setAlpha(0.3);
      this.sprite.stop();
      this.hpBarBaseLeft.setVisible(false);
      this.hpBarBaseCenter.setVisible(false);
      this.hpBarBaseRight.setVisible(false);
      this.hpBarFill.setVisible(false);
    }

    return appliedDamage;
  }

  flashDamage(): void {
    if (!this.sprite.active) {
      return;
    }

    const token = ++this.damageFlashToken;
    this.sprite.setTintFill(0xffffff);
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setScale(this.baseScale * 1.08);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale,
      scaleY: this.baseScale,
      duration: 120,
      ease: 'Quad.Out',
    });
    this.scene.time.delayedCall(90, () => {
      if (!this.sprite.active || token !== this.damageFlashToken) {
        return;
      }
      this.applyPersistentTint();
    });
  }

  setAnimState(newState: UnitAnimState): void {
    if (this.state.state === 'dead') return;
    if (this.state.state === newState) return;

    this.state.state = newState;
    const animationPrefix = getAnimationPrefix(this.state);

    switch (newState) {
      case 'idle':
        this.sprite.play(`${animationPrefix}-idle-anim`, true);
        break;
      case 'moving':
        this.sprite.play(`${animationPrefix}-run-anim`, true);
        break;
      case 'attacking':
        this.sprite.play(`${animationPrefix}-attack-anim`, true);
        this.sprite.once('animationcomplete', () => {
          if (this.isAlive()) {
            this.setAnimState('idle');
          }
        });
        break;
    }
  }

  private updateHpBar(): void {
    const totalSceneWidth = HP_BAR_TOTAL_WIDTH;
    const capSceneWidth = HP_BAR_BASE_CAP_SOURCE_WIDTH * HP_BAR_SCALE;
    const centerSceneWidth = totalSceneWidth - capSceneWidth * 2;
    const leftX = Math.round(this.state.position.x - totalSceneWidth / 2);
    const baseY = Math.round(this.state.position.y - this.hpBarYOffset);

    const visible = this.isAlive();
    this.hpBarBaseLeft.setVisible(visible);
    this.hpBarBaseCenter.setVisible(visible);
    this.hpBarBaseRight.setVisible(visible);
    this.hpBarFill.setVisible(visible);
    if (!visible) {
      return;
    }

    this.hpBarBaseLeft.setPosition(leftX, baseY);
    this.hpBarBaseCenter.setPosition(leftX + capSceneWidth, baseY);
    this.hpBarBaseCenter.setSize(centerSceneWidth / HP_BAR_SCALE, HP_BAR_BASE_SOURCE_HEIGHT);
    this.hpBarBaseRight.setPosition(leftX + capSceneWidth + centerSceneWidth, baseY);

    const ratio = Phaser.Math.Clamp(this.state.hp / this.state.maxHp, 0, 1);
    if (ratio <= 0) {
      this.hpBarFill.setVisible(false);
      return;
    }

    const fillWidthScene = Math.max(1, HP_BAR_FILL_MAX_SCENE_WIDTH * ratio);
    const fillWidthSource = fillWidthScene / HP_BAR_SCALE;
    const fillX = leftX + HP_BAR_FILL_INSET_SCENE;

    this.hpBarFill.setVisible(true);
    this.hpBarFill.setPosition(fillX, baseY);
    this.hpBarFill.setSize(fillWidthSource, HP_BAR_FILL_SOURCE_HEIGHT);
  }

  syncVisuals(): void {
    this.sprite.setPosition(this.state.position.x, this.state.position.y);
    this.labelText?.setPosition(this.state.position.x, this.state.position.y - this.labelYOffset);
    this.updateHpBar();
  }

  setSelectionHandler(handler?: (state: UnitState) => void): void {
    this.sprite.removeAllListeners('pointerdown');
    this.sprite.on('pointerdown', () => {
      if (handler) {
        handler(this.state);
        return;
      }

      EventBus.emit('unit-selected', this.state);
    });
  }

  destroy(): void {
    this.sprite.destroy();
    this.hpBarBaseLeft.destroy();
    this.hpBarBaseCenter.destroy();
    this.hpBarBaseRight.destroy();
    this.hpBarFill.destroy();
    this.labelText?.destroy();
  }

  private applyPersistentTint(): void {
    this.sprite.clearTint();
    if (this.persistentTint !== undefined) {
      this.sprite.setTint(this.persistentTint);
    }
  }

  private ensureHpBarFrames(scene: Scene): void {
    const baseTexture = scene.textures.get(HP_BAR_TEXTURE_BASE);
    if (!baseTexture.has(BIGBAR_BASE_LEFT_FRAME)) {
      baseTexture.add(BIGBAR_BASE_LEFT_FRAME, 0, 49, 22, 15, 19);
    }
    if (!baseTexture.has(BIGBAR_BASE_CENTER_FRAME)) {
      baseTexture.add(BIGBAR_BASE_CENTER_FRAME, 0, 128, 22, 64, 19);
    }
    if (!baseTexture.has(BIGBAR_BASE_RIGHT_FRAME)) {
      baseTexture.add(BIGBAR_BASE_RIGHT_FRAME, 0, 256, 22, 15, 19);
    }

    const fillTexture = scene.textures.get(HP_BAR_TEXTURE_FILL);
    if (!fillTexture.has(BIGBAR_FILL_FRAME)) {
      fillTexture.add(BIGBAR_FILL_FRAME, 0, 0, 30, 64, 3);
    }
  }
}

function getAnimationPrefix(
  unitState: Pick<UnitState, 'faction' | 'role' | 'variantId'>
): string {
  if (unitState.variantId) {
    return getEnemyVariantDefinition(unitState.variantId).animationPrefix;
  }

  return getFactionRoleAnimationPrefix(unitState.faction, unitState.role);
}

function getFactionRoleAnimationPrefix(faction: UnitFaction, role: UnitRole): string {
  const factionPrefix = faction === 'allied' ? 'blue' : 'red';
  return `${factionPrefix}-${role}`;
}

function resolveBaseScale(unitState: Pick<UnitState, 'role' | 'variantId'>): number {
  if (unitState.role === 'hero') {
    return 0.75;
  }

  if (unitState.variantId) {
    return getEnemyVariantDefinition(unitState.variantId).scale;
  }

  return 0.5;
}
