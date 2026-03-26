import { Scene } from 'phaser';

export class BootScene extends Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.spritesheet('blue-warrior-idle', 'assets/Units/Blue Units/Warrior/Warrior_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-warrior-run', 'assets/Units/Blue Units/Warrior/Warrior_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-warrior-attack', 'assets/Units/Blue Units/Warrior/Warrior_Attack1.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-archer-idle', 'assets/Units/Blue Units/Archer/Archer_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-archer-run', 'assets/Units/Blue Units/Archer/Archer_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-archer-attack', 'assets/Units/Blue Units/Archer/Archer_Shoot.png', { frameWidth: 192, frameHeight: 192 });
    this.load.image('blue-archer-arrow', 'assets/Units/Blue Units/Archer/Arrow.png');

    this.load.spritesheet('red-warrior-idle', 'assets/Units/Red Units/Warrior/Warrior_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-warrior-run', 'assets/Units/Red Units/Warrior/Warrior_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-warrior-attack', 'assets/Units/Red Units/Warrior/Warrior_Attack1.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-archer-idle', 'assets/Units/Red Units/Archer/Archer_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-archer-run', 'assets/Units/Red Units/Archer/Archer_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-archer-attack', 'assets/Units/Red Units/Archer/Archer_Shoot.png', { frameWidth: 192, frameHeight: 192 });
    this.load.image('red-archer-arrow', 'assets/Units/Red Units/Archer/Arrow.png');

    this.load.image('castle-blue', 'assets/Buildings/Blue Buildings/Castle.png');
    this.load.image('castle-red', 'assets/Buildings/Red Buildings/Castle.png');
    this.load.image('terrain-tileset', 'assets/Terrain/Tileset/Tilemap_color1.png');
    this.load.image('terrain-tileset-alt', 'assets/Terrain/Tileset/Tilemap_color3.png');
    this.load.image('terrain-rock-1', 'assets/Terrain/Decorations/Rocks/Rock1.png');
    this.load.image('terrain-rock-2', 'assets/Terrain/Decorations/Rocks/Rock2.png');
    this.load.image('terrain-rock-3', 'assets/Terrain/Decorations/Rocks/Rock3.png');
    this.load.image('terrain-rock-4', 'assets/Terrain/Decorations/Rocks/Rock4.png');
    this.load.image('terrain-bush-1', 'assets/Terrain/Decorations/Bushes/Bushe1.png');
    this.load.image('terrain-bush-2', 'assets/Terrain/Decorations/Bushes/Bushe2.png');
    this.load.image('terrain-bush-3', 'assets/Terrain/Decorations/Bushes/Bushe3.png');
    this.load.image('terrain-bush-4', 'assets/Terrain/Decorations/Bushes/Bushe4.png');
    this.load.image('terrain-cloud-1', 'assets/Terrain/Decorations/Clouds/Clouds_01.png');
    this.load.image('terrain-cloud-2', 'assets/Terrain/Decorations/Clouds/Clouds_02.png');
    this.load.image('terrain-cloud-3', 'assets/Terrain/Decorations/Clouds/Clouds_03.png');
    this.load.image('terrain-cloud-4', 'assets/Terrain/Decorations/Clouds/Clouds_04.png');
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
  }

  create(): void {
    this.anims.create({ key: 'blue-warrior-idle-anim', frames: this.anims.generateFrameNumbers('blue-warrior-idle', { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-warrior-run-anim', frames: this.anims.generateFrameNumbers('blue-warrior-run', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-warrior-attack-anim', frames: this.anims.generateFrameNumbers('blue-warrior-attack', { start: 0, end: 3 }), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'blue-archer-idle-anim', frames: this.anims.generateFrameNumbers('blue-archer-idle', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-archer-run-anim', frames: this.anims.generateFrameNumbers('blue-archer-run', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-archer-attack-anim', frames: this.anims.generateFrameNumbers('blue-archer-attack', { start: 0, end: 7 }), frameRate: 8, repeat: 0 });

    this.anims.create({ key: 'red-warrior-idle-anim', frames: this.anims.generateFrameNumbers('red-warrior-idle', { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-warrior-run-anim', frames: this.anims.generateFrameNumbers('red-warrior-run', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-warrior-attack-anim', frames: this.anims.generateFrameNumbers('red-warrior-attack', { start: 0, end: 3 }), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'red-archer-idle-anim', frames: this.anims.generateFrameNumbers('red-archer-idle', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-archer-run-anim', frames: this.anims.generateFrameNumbers('red-archer-run', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-archer-attack-anim', frames: this.anims.generateFrameNumbers('red-archer-attack', { start: 0, end: 7 }), frameRate: 8, repeat: 0 });

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
