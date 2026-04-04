import { Scene } from 'phaser';
import { ENEMY_VARIANT_DEFINITIONS } from '../data/enemyVariants';

/**
 * PreBootScene loads only the logo, then hands off to BootScene
 * which displays the logo + progress bar while loading all game assets.
 */
export class PreBootScene extends Scene {
  constructor() {
    super('PreBootScene');
  }

  preload(): void {
    this.load.image('logo', 'assets/logo.png');
  }

  create(): void {
    this.scene.start('BootScene');
  }
}

export class BootScene extends Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // Show the logo (already loaded by PreBootScene)
    const logo = this.add.image(512, 320, 'logo').setOrigin(0.5).setDepth(10);
    logo.setScale(2);

    const loadingText = this.add.text(512, 430, 'Loading...', {
      fontSize: '16px',
      color: '#eadfc7',
      fontFamily: '"NeoDunggeunmoPro", monospace',
    }).setOrigin(0.5).setDepth(10);

    // Progress bar
    this.add.rectangle(512, 460, 300, 12, 0x3b2c18).setDepth(10);
    const barFill = this.add.rectangle(512 - 148, 460, 0, 8, 0xffd700).setOrigin(0, 0.5).setDepth(10);

    this.load.on('progress', (value: number) => {
      barFill.width = 296 * value;
      loadingText.setText(`Loading... ${Math.round(value * 100)}%`);
    });

    // Load all game assets
    this.load.spritesheet('blue-warrior-idle', 'assets/Units/Blue Units/Warrior/Warrior_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-warrior-run', 'assets/Units/Blue Units/Warrior/Warrior_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-warrior-attack', 'assets/Units/Blue Units/Warrior/Warrior_Attack1.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-archer-idle', 'assets/Units/Blue Units/Archer/Archer_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-archer-run', 'assets/Units/Blue Units/Archer/Archer_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-archer-attack', 'assets/Units/Blue Units/Archer/Archer_Shoot.png', { frameWidth: 192, frameHeight: 192 });
    this.load.image('blue-archer-arrow', 'assets/Units/Blue Units/Archer/Arrow.png');
    this.load.spritesheet('blue-hero-idle', 'assets/Units/Hero Units/Hero1_Idle.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('blue-hero-run', 'assets/Units/Hero Units/Hero1_Run.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('blue-hero-attack', 'assets/Units/Hero Units/Hero1_Attack.png', { frameWidth: 128, frameHeight: 128 });

    this.load.spritesheet('red-warrior-idle', 'assets/Units/Red Units/Warrior/Warrior_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-warrior-run', 'assets/Units/Red Units/Warrior/Warrior_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-warrior-attack', 'assets/Units/Red Units/Warrior/Warrior_Attack1.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-archer-idle', 'assets/Units/Red Units/Archer/Archer_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-archer-run', 'assets/Units/Red Units/Archer/Archer_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-archer-attack', 'assets/Units/Red Units/Archer/Archer_Shoot.png', { frameWidth: 192, frameHeight: 192 });
    this.load.image('red-archer-arrow', 'assets/Units/Red Units/Archer/Arrow.png');

    this.load.image('castle-blue', 'assets/Buildings/Blue Buildings/Castle.png');
    this.load.image('castle-red', 'assets/Buildings/Red Buildings/Castle.png');
    this.load.spritesheet('portal-main', 'assets/Buildings/portal_main.png', {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.image('terrain-tileset', 'assets/Terrain/Tileset/Tilemap_color1.png');
    this.load.image('terrain-tileset-2', 'assets/Terrain/Tileset/Tilemap_color2.png');
    this.load.image('terrain-tileset-alt', 'assets/Terrain/Tileset/Tilemap_color3.png');
    this.load.image('terrain-tileset-4', 'assets/Terrain/Tileset/Tilemap_color4.png');
    this.load.image('terrain-tileset-5', 'assets/Terrain/Tileset/Tilemap_color5.png');
    this.load.image('terrain-shadow', 'assets/Terrain/Tileset/Shadow.png');

    // Water & foam
    this.load.image('water-bg', 'assets/Terrain/Tileset/Water Background color.png');
    this.load.spritesheet('water-foam', 'assets/Terrain/Tileset/Water Foam.png', { frameWidth: 192, frameHeight: 192 });

    // Trees (spritesheets for idle sway animation)
    this.load.spritesheet('tree-1', 'assets/Terrain/Resources/Wood/Trees/Tree1.png', { frameWidth: 192, frameHeight: 256 });
    this.load.spritesheet('tree-2', 'assets/Terrain/Resources/Wood/Trees/Tree2.png', { frameWidth: 192, frameHeight: 256 });
    this.load.spritesheet('tree-3', 'assets/Terrain/Resources/Wood/Trees/Tree3.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('tree-4', 'assets/Terrain/Resources/Wood/Trees/Tree4.png', { frameWidth: 192, frameHeight: 192 });

    // Water rocks
    this.load.spritesheet('water-rock-1', 'assets/Terrain/Decorations/Rocks in the Water/Water Rocks_01.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('water-rock-2', 'assets/Terrain/Decorations/Rocks in the Water/Water Rocks_02.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('water-rock-3', 'assets/Terrain/Decorations/Rocks in the Water/Water Rocks_03.png', { frameWidth: 64, frameHeight: 64 });
    this.load.image('terrain-rock-1', 'assets/Terrain/Decorations/Rocks/Rock1.png');
    this.load.image('terrain-rock-2', 'assets/Terrain/Decorations/Rocks/Rock2.png');
    this.load.image('terrain-rock-3', 'assets/Terrain/Decorations/Rocks/Rock3.png');
    this.load.image('terrain-rock-4', 'assets/Terrain/Decorations/Rocks/Rock4.png');
    this.load.image('terrain-bush-1', 'assets/Terrain/Decorations/Bushes/Bushe1.png');
    this.load.image('terrain-bush-2', 'assets/Terrain/Decorations/Bushes/Bushe2.png');
    this.load.image('terrain-bush-3', 'assets/Terrain/Decorations/Bushes/Bushe3.png');
    this.load.image('terrain-bush-4', 'assets/Terrain/Decorations/Bushes/Bushe4.png');
    this.load.spritesheet('terrain-bush-1-sheet', 'assets/Terrain/Decorations/Bushes/Bushe1.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('terrain-bush-2-sheet', 'assets/Terrain/Decorations/Bushes/Bushe2.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('terrain-bush-3-sheet', 'assets/Terrain/Decorations/Bushes/Bushe3.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('terrain-bush-4-sheet', 'assets/Terrain/Decorations/Bushes/Bushe4.png', { frameWidth: 128, frameHeight: 128 });
    this.load.image('terrain-cloud-1', 'assets/Terrain/Decorations/Clouds/Clouds_01.png');
    this.load.image('terrain-cloud-2', 'assets/Terrain/Decorations/Clouds/Clouds_02.png');
    this.load.image('terrain-cloud-3', 'assets/Terrain/Decorations/Clouds/Clouds_03.png');
    this.load.image('terrain-cloud-4', 'assets/Terrain/Decorations/Clouds/Clouds_04.png');
    this.load.text('tile-mapper-workspace', 'dev/tile-mapper.workspace.json');
    this.load.image('ui-smallbar-base', 'assets/UI Elements/UI Elements/Bars/SmallBar_Base.png');
    this.load.image('ui-smallbar-fill', 'assets/UI Elements/UI Elements/Bars/SmallBar_Fill.png');
    this.load.image('ui-bigbar-base', 'assets/UI Elements/UI Elements/Bars/BigBar_Base.png');
    this.load.image('ui-bigbar-fill', 'assets/UI Elements/UI Elements/Bars/BigBar_Fill.png');
    this.load.image(
      'commander-portrait',
      'assets/UI Elements/UI Elements/Human Avatars/Avatars_01.png'
    );
    this.load.spritesheet(
      'ui-ribbons-small',
      'assets/UI Elements/UI Elements/Ribbons/SmallRibbons.png',
      { frameWidth: 64, frameHeight: 64 }
    );
    this.load.tilemapTiledJSON('overworld-map', 'assets/maps/overworld.json');
    this.load.tilemapTiledJSON('battlefield-map', 'assets/maps/battlefield.json');
    this.load.tilemapTiledJSON('playground-map', 'assets/maps/playground.json');

    for (const variant of Object.values(ENEMY_VARIANT_DEFINITIONS)) {
      this.load.spritesheet(variant.idle.textureKey, variant.idle.assetPath, {
        frameWidth: variant.idle.frameWidth,
        frameHeight: variant.idle.frameHeight,
      });
      this.load.spritesheet(variant.run.textureKey, variant.run.assetPath, {
        frameWidth: variant.run.frameWidth,
        frameHeight: variant.run.frameHeight,
      });
      this.load.spritesheet(variant.attack.textureKey, variant.attack.assetPath, {
        frameWidth: variant.attack.frameWidth,
        frameHeight: variant.attack.frameHeight,
      });
    }
  }

  create(): void {
    this.anims.create({ key: 'blue-warrior-idle-anim', frames: this.anims.generateFrameNumbers('blue-warrior-idle', { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-warrior-run-anim', frames: this.anims.generateFrameNumbers('blue-warrior-run', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-warrior-attack-anim', frames: this.anims.generateFrameNumbers('blue-warrior-attack', { start: 0, end: 3 }), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'blue-archer-idle-anim', frames: this.anims.generateFrameNumbers('blue-archer-idle', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-archer-run-anim', frames: this.anims.generateFrameNumbers('blue-archer-run', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-archer-attack-anim', frames: this.anims.generateFrameNumbers('blue-archer-attack', { start: 0, end: 7 }), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'blue-hero-idle-anim', frames: this.anims.generateFrameNumbers('blue-hero-idle', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-hero-run-anim', frames: this.anims.generateFrameNumbers('blue-hero-run', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-hero-attack-anim', frames: this.anims.generateFrameNumbers('blue-hero-attack', { start: 0, end: 3 }), frameRate: 8, repeat: 0 });

    this.anims.create({ key: 'red-warrior-idle-anim', frames: this.anims.generateFrameNumbers('red-warrior-idle', { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-warrior-run-anim', frames: this.anims.generateFrameNumbers('red-warrior-run', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-warrior-attack-anim', frames: this.anims.generateFrameNumbers('red-warrior-attack', { start: 0, end: 3 }), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'red-archer-idle-anim', frames: this.anims.generateFrameNumbers('red-archer-idle', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-archer-run-anim', frames: this.anims.generateFrameNumbers('red-archer-run', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-archer-attack-anim', frames: this.anims.generateFrameNumbers('red-archer-attack', { start: 0, end: 7 }), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'portal-main-anim', frames: this.anims.generateFrameNumbers('portal-main', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });

    // Water foam animation (16 frames at 192x192)
    this.anims.create({ key: 'water-foam-anim', frames: this.anims.generateFrameNumbers('water-foam', { start: 0, end: 15 }), frameRate: 6, repeat: -1 });
    // Tree idle sway animations
    this.anims.create({ key: 'tree-1-anim', frames: this.anims.generateFrameNumbers('tree-1', { start: 0, end: 7 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'tree-2-anim', frames: this.anims.generateFrameNumbers('tree-2', { start: 0, end: 7 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'tree-3-anim', frames: this.anims.generateFrameNumbers('tree-3', { start: 0, end: 7 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'tree-4-anim', frames: this.anims.generateFrameNumbers('tree-4', { start: 0, end: 7 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'terrain-bush-1-anim', frames: this.anims.generateFrameNumbers('terrain-bush-1-sheet', { start: 0, end: 7 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'terrain-bush-2-anim', frames: this.anims.generateFrameNumbers('terrain-bush-2-sheet', { start: 0, end: 7 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'terrain-bush-3-anim', frames: this.anims.generateFrameNumbers('terrain-bush-3-sheet', { start: 0, end: 7 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'terrain-bush-4-anim', frames: this.anims.generateFrameNumbers('terrain-bush-4-sheet', { start: 0, end: 7 }), frameRate: 6, repeat: -1 });
    // Water rocks animations (16 frames at 64x64)
    this.anims.create({ key: 'water-rock-1-anim', frames: this.anims.generateFrameNumbers('water-rock-1', { start: 0, end: 15 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'water-rock-2-anim', frames: this.anims.generateFrameNumbers('water-rock-2', { start: 0, end: 15 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'water-rock-3-anim', frames: this.anims.generateFrameNumbers('water-rock-3', { start: 0, end: 15 }), frameRate: 6, repeat: -1 });

    for (const variant of Object.values(ENEMY_VARIANT_DEFINITIONS)) {
      createAnimation(this, `${variant.animationPrefix}-idle-anim`, variant.idle.textureKey, variant.idle.frameCount, 8, -1);
      createAnimation(this, `${variant.animationPrefix}-run-anim`, variant.run.textureKey, variant.run.frameCount, 8, -1);
      createAnimation(this, `${variant.animationPrefix}-attack-anim`, variant.attack.textureKey, variant.attack.frameCount, 8, 0);
    }

    const fontLoad = document.fonts?.load('16px "NeoDunggeunmoPro"');
    if (!fontLoad) {
      this.scene.start('OverworldScene');
      return;
    }

    void fontLoad
      .then(() => {
        this.scene.start('OverworldScene');
      })
      .catch(() => {
        this.scene.start('OverworldScene');
      });
  }
}

function createAnimation(
  scene: Scene,
  key: string,
  textureKey: string,
  frameCount: number,
  frameRate: number,
  repeat: number
): void {
  if (scene.anims.exists(key)) {
    return;
  }

  scene.anims.create({
    key,
    frames: scene.anims.generateFrameNumbers(textureKey, { start: 0, end: frameCount - 1 }),
    frameRate,
    repeat,
  });
}
