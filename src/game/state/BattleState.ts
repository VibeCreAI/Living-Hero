import {
  BattleState,
  BattlePhase,
  BattleMode,
  UnitState,
  HeroState,
  UnitFaction,
  DamageEvent,
  BattleObstacle,
  BattleGridSummary,
  PortalFloorNumber,
} from '../types';

const RECENT_DAMAGE_WINDOW_SEC = 4;

export class BattleStateManager {
  private state: BattleState;

  constructor() {
    this.state = {
      sessionId: '',
      nodeId: '',
      mode: 'battle',
      maxFloor: 3,
      grid: {
        cols: 1,
        rows: 1,
        tileWidth: 1,
        tileHeight: 1,
        worldWidth: 1,
        worldHeight: 1,
        blockedTiles: [],
        tacticalAnchors: [],
      },
      timeSec: 0,
      phase: 'init',
      alliedUnits: [],
      enemyUnits: [],
      heroes: [],
      obstacles: [],
      recentDamage: [],
    };
  }

  init(
    sessionId: string,
    nodeId: string,
    alliedUnits: UnitState[],
    enemyUnits: UnitState[],
    heroes: HeroState[],
    obstacles: BattleObstacle[],
    grid: BattleGridSummary,
    mode: BattleMode = 'battle',
    floorNumber?: PortalFloorNumber
  ): void {
    this.state = {
      sessionId,
      nodeId,
      mode,
      floorNumber,
      maxFloor: 3,
      grid,
      timeSec: 0,
      phase: 'init',
      alliedUnits,
      enemyUnits,
      heroes,
      obstacles,
      recentDamage: [],
    };
  }

  getState(): BattleState {
    return this.state;
  }

  updateTime(deltaSec: number): void {
    this.state.timeSec += deltaSec;
    this.pruneRecentDamage();
  }

  setPhase(phase: BattlePhase): void {
    this.state.phase = phase;
  }

  getAllUnits(): UnitState[] {
    return [...this.state.alliedUnits, ...this.state.enemyUnits];
  }

  getAliveUnits(faction: UnitFaction): UnitState[] {
    const units = faction === 'allied' ? this.state.alliedUnits : this.state.enemyUnits;
    return units.filter((u) => u.state !== 'dead');
  }

  recordDamage(events: DamageEvent[]): void {
    if (events.length > 0) {
      this.state.recentDamage.push(...events);
    }
    this.pruneRecentDamage();
  }

  private pruneRecentDamage(): void {
    const cutoff = this.state.timeSec - RECENT_DAMAGE_WINDOW_SEC;
    this.state.recentDamage = this.state.recentDamage.filter((event) => event.timeSec >= cutoff);
  }
}
