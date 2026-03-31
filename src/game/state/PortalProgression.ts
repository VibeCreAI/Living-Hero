import {
  PortalClearedFloor,
  PortalFloorNumber,
  PortalProgressState,
} from '../types';
import { getNextPortalFloor, MAX_PORTAL_FLOOR } from '../data/portalFloors';

export const PORTAL_PROGRESS_STORAGE_KEY = 'living-heros.portal_progress_v1';

const DEFAULT_PORTAL_PROGRESS: PortalProgressState = {
  highestUnlockedFloor: 1,
  highestClearedFloor: 0,
};

function clampFloor(value: unknown): PortalFloorNumber {
  if (value === 2 || value === 3) {
    return value;
  }

  return 1;
}

function clampClearedFloor(value: unknown): PortalClearedFloor {
  if (value === 1 || value === 2 || value === 3) {
    return value;
  }

  return 0;
}

export function loadPortalProgress(): PortalProgressState {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PORTAL_PROGRESS };
  }

  try {
    const raw = window.localStorage.getItem(PORTAL_PROGRESS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PORTAL_PROGRESS };
    }

    const parsed = JSON.parse(raw) as Partial<PortalProgressState>;
    const highestUnlockedFloor = clampFloor(parsed.highestUnlockedFloor);
    const highestClearedFloor = clampClearedFloor(parsed.highestClearedFloor);

    return {
      highestUnlockedFloor,
      highestClearedFloor:
        highestClearedFloor > highestUnlockedFloor
          ? highestUnlockedFloor
          : highestClearedFloor,
    };
  } catch {
    return { ...DEFAULT_PORTAL_PROGRESS };
  }
}

export function savePortalProgress(progress: PortalProgressState): PortalProgressState {
  const highestUnlockedFloor = clampFloor(progress.highestUnlockedFloor);
  const highestClearedFloor = Math.min(
    clampClearedFloor(progress.highestClearedFloor),
    highestUnlockedFloor
  ) as PortalClearedFloor;

  const normalized: PortalProgressState = {
    highestUnlockedFloor,
    highestClearedFloor,
  };

  if (typeof window === 'undefined') {
    return normalized;
  }

  try {
    window.localStorage.setItem(PORTAL_PROGRESS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage failures and continue with the in-memory result.
  }

  return normalized;
}

export function unlockPortalFloor(clearedFloor: PortalFloorNumber): PortalProgressState {
  const current = loadPortalProgress();
  const nextFloor = getNextPortalFloor(clearedFloor);

  return savePortalProgress({
    highestUnlockedFloor: nextFloor
      ? (Math.max(current.highestUnlockedFloor, nextFloor) as PortalFloorNumber)
      : MAX_PORTAL_FLOOR,
    highestClearedFloor: Math.max(current.highestClearedFloor, clearedFloor) as PortalClearedFloor,
  });
}
