import { EnemyVariantId, PortalFloorNumber } from '../types';

export const PORTAL_NODE_ID = 'portal-main';
export const PORTAL_LABEL = 'Abyss Portal';
export const MAX_PORTAL_FLOOR: PortalFloorNumber = 3;
export const PORTAL_FLOORS: PortalFloorNumber[] = [1, 2, 3];

export interface PortalFloorEnemyConfig {
  variantId: EnemyVariantId;
  count: number;
}

export interface PortalFloorConfig {
  floorNumber: PortalFloorNumber;
  statMultiplier: number;
  enemies: PortalFloorEnemyConfig[];
}

export const PORTAL_FLOOR_CONFIGS: Record<PortalFloorNumber, PortalFloorConfig> = {
  1: {
    floorNumber: 1,
    statMultiplier: 1,
    enemies: [
      { variantId: 'skull', count: 3 },
      { variantId: 'harpoon-fish', count: 2 },
    ],
  },
  2: {
    floorNumber: 2,
    statMultiplier: 1.15,
    enemies: [
      { variantId: 'lancer', count: 4 },
      { variantId: 'shaman', count: 2 },
    ],
  },
  3: {
    floorNumber: 3,
    statMultiplier: 1.3,
    enemies: [
      { variantId: 'minotaur', count: 5 },
      { variantId: 'gnoll', count: 3 },
    ],
  },
};

export function getPortalFloorConfig(floorNumber: PortalFloorNumber): PortalFloorConfig {
  return PORTAL_FLOOR_CONFIGS[floorNumber];
}

export function getNextPortalFloor(
  floorNumber: PortalFloorNumber
): PortalFloorNumber | null {
  if (floorNumber >= MAX_PORTAL_FLOOR) {
    return null;
  }

  return (floorNumber + 1) as PortalFloorNumber;
}
