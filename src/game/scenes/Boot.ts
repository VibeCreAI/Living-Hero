import { Scene } from 'phaser';

export class BootScene extends Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // ── Blue (allied) unit sprite sheets ──
    this.load.spritesheet('blue-warrior-idle', 'assets/Units/Blue Units/Warrior/Warrior_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-warrior-run', 'assets/Units/Blue Units/Warrior/Warrior_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-warrior-attack', 'assets/Units/Blue Units/Warrior/Warrior_Attack1.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-archer-idle', 'assets/Units/Blue Units/Archer/Archer_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-archer-run', 'assets/Units/Blue Units/Archer/Archer_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('blue-archer-attack', 'assets/Units/Blue Units/Archer/Archer_Shoot.png', { frameWidth: 192, frameHeight: 192 });

    // ── Red (enemy) unit sprite sheets ──
    this.load.spritesheet('red-warrior-idle', 'assets/Units/Red Units/Warrior/Warrior_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-warrior-run', 'assets/Units/Red Units/Warrior/Warrior_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-warrior-attack', 'assets/Units/Red Units/Warrior/Warrior_Attack1.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-archer-idle', 'assets/Units/Red Units/Archer/Archer_Idle.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-archer-run', 'assets/Units/Red Units/Archer/Archer_Run.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('red-archer-attack', 'assets/Units/Red Units/Archer/Archer_Shoot.png', { frameWidth: 192, frameHeight: 192 });

    // ── Buildings for overworld nodes ──
    this.load.image('castle-blue', 'assets/Buildings/Blue Buildings/Castle.png');
    this.load.image('castle-red', 'assets/Buildings/Red Buildings/Castle.png');

    // ── Terrain ──
    this.load.image('terrain-tileset', 'assets/Terrain/Tileset/Tilemap_color1.png');
  }

  create(): void {
    // ── Allied animations ──
    this.anims.create({ key: 'blue-warrior-idle-anim', frames: this.anims.generateFrameNumbers('blue-warrior-idle', { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-warrior-run-anim', frames: this.anims.generateFrameNumbers('blue-warrior-run', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-warrior-attack-anim', frames: this.anims.generateFrameNumbers('blue-warrior-attack', { start: 0, end: 3 }), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'blue-archer-idle-anim', frames: this.anims.generateFrameNumbers('blue-archer-idle', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-archer-run-anim', frames: this.anims.generateFrameNumbers('blue-archer-run', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'blue-archer-attack-anim', frames: this.anims.generateFrameNumbers('blue-archer-attack', { start: 0, end: 7 }), frameRate: 8, repeat: 0 });

    // ── Enemy animations ──
    this.anims.create({ key: 'red-warrior-idle-anim', frames: this.anims.generateFrameNumbers('red-warrior-idle', { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-warrior-run-anim', frames: this.anims.generateFrameNumbers('red-warrior-run', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-warrior-attack-anim', frames: this.anims.generateFrameNumbers('red-warrior-attack', { start: 0, end: 3 }), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'red-archer-idle-anim', frames: this.anims.generateFrameNumbers('red-archer-idle', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-archer-run-anim', frames: this.anims.generateFrameNumbers('red-archer-run', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'red-archer-attack-anim', frames: this.anims.generateFrameNumbers('red-archer-attack', { start: 0, end: 7 }), frameRate: 8, repeat: 0 });

    this.scene.start('OverworldScene');
  }
}
