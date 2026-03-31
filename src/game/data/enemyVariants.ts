import { EnemyVariantId, UnitRole } from '../types';

interface AnimationSheetDefinition {
  textureKey: string;
  assetPath: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

export interface EnemyVariantDefinition {
  id: EnemyVariantId;
  displayName: string;
  role: Exclude<UnitRole, 'hero'>;
  animationPrefix: string;
  frameHeight: number;
  scale: number;
  idle: AnimationSheetDefinition;
  run: AnimationSheetDefinition;
  attack: AnimationSheetDefinition;
}

const TARGET_RENDER_HEIGHT = 96;

function buildScale(frameHeight: number): number {
  return TARGET_RENDER_HEIGHT / frameHeight;
}

export const ENEMY_VARIANT_DEFINITIONS: Record<EnemyVariantId, EnemyVariantDefinition> = {
  'harpoon-fish': {
    id: 'harpoon-fish',
    displayName: 'Harpoon Fish',
    role: 'archer',
    animationPrefix: 'enemy-harpoon-fish',
    frameHeight: 192,
    scale: buildScale(192),
    idle: {
      textureKey: 'enemy-harpoon-fish-idle',
      assetPath: 'assets/Enemy/Harpoon Fish/HarpoonFish_Idle.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 8,
    },
    run: {
      textureKey: 'enemy-harpoon-fish-run',
      assetPath: 'assets/Enemy/Harpoon Fish/HarpoonFish_Run.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 6,
    },
    attack: {
      textureKey: 'enemy-harpoon-fish-attack',
      assetPath: 'assets/Enemy/Harpoon Fish/HarpoonFish_Throw.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 8,
    },
  },
  shaman: {
    id: 'shaman',
    displayName: 'Shaman',
    role: 'archer',
    animationPrefix: 'enemy-shaman',
    frameHeight: 192,
    scale: buildScale(192),
    idle: {
      textureKey: 'enemy-shaman-idle',
      assetPath: 'assets/Enemy/Shaman/Shaman_Idle.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 8,
    },
    run: {
      textureKey: 'enemy-shaman-run',
      assetPath: 'assets/Enemy/Shaman/Shaman_Run.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 4,
    },
    attack: {
      textureKey: 'enemy-shaman-attack',
      assetPath: 'assets/Enemy/Shaman/Shaman_Attack.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 10,
    },
  },
  gnoll: {
    id: 'gnoll',
    displayName: 'Gnoll',
    role: 'archer',
    animationPrefix: 'enemy-gnoll',
    frameHeight: 192,
    scale: buildScale(192),
    idle: {
      textureKey: 'enemy-gnoll-idle',
      assetPath: 'assets/Enemy/Gnoll/Gnoll_Idle.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 6,
    },
    run: {
      textureKey: 'enemy-gnoll-run',
      assetPath: 'assets/Enemy/Gnoll/Gnoll_Walk.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 8,
    },
    attack: {
      textureKey: 'enemy-gnoll-attack',
      assetPath: 'assets/Enemy/Gnoll/Gnoll_Throw.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 8,
    },
  },
  skull: {
    id: 'skull',
    displayName: 'Skull',
    role: 'warrior',
    animationPrefix: 'enemy-skull',
    frameHeight: 192,
    scale: buildScale(192),
    idle: {
      textureKey: 'enemy-skull-idle',
      assetPath: 'assets/Enemy/Skull/Skull_Idle.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 8,
    },
    run: {
      textureKey: 'enemy-skull-run',
      assetPath: 'assets/Enemy/Skull/Skull_Run.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 6,
    },
    attack: {
      textureKey: 'enemy-skull-attack',
      assetPath: 'assets/Enemy/Skull/Skull_Attack.png',
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 7,
    },
  },
  lancer: {
    id: 'lancer',
    displayName: 'Lancer',
    role: 'warrior',
    animationPrefix: 'enemy-lancer',
    frameHeight: 256,
    scale: buildScale(256),
    idle: {
      textureKey: 'enemy-lancer-idle',
      assetPath: 'assets/Enemy/Lancer/Lancer_Idle.png',
      frameWidth: 256,
      frameHeight: 256,
      frameCount: 7,
    },
    run: {
      textureKey: 'enemy-lancer-run',
      assetPath: 'assets/Enemy/Lancer/Lancer_Run.png',
      frameWidth: 256,
      frameHeight: 256,
      frameCount: 6,
    },
    attack: {
      textureKey: 'enemy-lancer-attack',
      assetPath: 'assets/Enemy/Lancer/Lancer_Attack.png',
      frameWidth: 256,
      frameHeight: 256,
      frameCount: 8,
    },
  },
  minotaur: {
    id: 'minotaur',
    displayName: 'Minotaur',
    role: 'warrior',
    animationPrefix: 'enemy-minotaur',
    frameHeight: 320,
    scale: 0.4,
    idle: {
      textureKey: 'enemy-minotaur-idle',
      assetPath: 'assets/Enemy/Minotaur/Minotaur_Idle.png',
      frameWidth: 320,
      frameHeight: 320,
      frameCount: 16,
    },
    run: {
      textureKey: 'enemy-minotaur-run',
      assetPath: 'assets/Enemy/Minotaur/Minotaur_Walk.png',
      frameWidth: 320,
      frameHeight: 320,
      frameCount: 8,
    },
    attack: {
      textureKey: 'enemy-minotaur-attack',
      assetPath: 'assets/Enemy/Minotaur/Minotaur_Attack.png',
      frameWidth: 320,
      frameHeight: 320,
      frameCount: 12,
    },
  },
};

export function getEnemyVariantDefinition(variantId: EnemyVariantId): EnemyVariantDefinition {
  return ENEMY_VARIANT_DEFINITIONS[variantId];
}
