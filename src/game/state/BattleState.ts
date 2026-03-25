import { BattleState, BattlePhase, UnitState, HeroState, UnitFaction } from '../types';

export class BattleStateManager {
  private state: BattleState;

  constructor() {
    this.state = {
      timeSec: 0,
      phase: 'init',
      alliedUnits: [],
      enemyUnits: [],
      heroes: [],
    };
  }

  init(alliedUnits: UnitState[], enemyUnits: UnitState[], heroes: HeroState[]): void {
    this.state = {
      timeSec: 0,
      phase: 'init',
      alliedUnits,
      enemyUnits,
      heroes,
    };
  }

  getState(): BattleState {
    return this.state;
  }

  updateTime(deltaSec: number): void {
    this.state.timeSec += deltaSec;
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
}
