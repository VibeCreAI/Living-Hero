import { UnitConfig } from '../types';

export const UNIT_CONFIGS: Record<string, UnitConfig> = {
  warrior: {
    role: 'warrior',
    hp: 100,
    attack: 15,
    attackRange: 50,
    attackSpeed: 1.0,
    moveSpeed: 80,
  },
  archer: {
    role: 'archer',
    hp: 60,
    attack: 12,
    attackRange: 200,
    attackSpeed: 0.8,
    moveSpeed: 60,
  },
};
