import { PreBootScene, BootScene } from './scenes/Boot';
import { OverworldScene } from './scenes/OverworldScene';
import { BattleScene } from './scenes/BattleScene';
import { AUTO, Game, Scale } from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  parent: 'game-container',
  backgroundColor: '#0a0a0a',
  scale: {
    mode: Scale.RESIZE,
    width: 1024,
    height: 768,
    min: { width: 640, height: 480 },
  },
  scene: [
    PreBootScene,
    BootScene,
    OverworldScene,
    BattleScene,
  ],
};

const StartGame = (parent: string) => {
  return new Game({ ...config, parent });
};

export default StartGame;
