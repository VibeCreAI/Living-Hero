import { HeroState, BattleState, HeroSummary } from '../types';

export function buildHeroSummary(
  heroState: HeroState,
  battleState: BattleState
): HeroSummary {
  return {
    heroState,
    currentCommand: heroState.currentCommand,
    nearbyAllies: battleState.alliedUnits.filter((u) => u.state !== 'dead'),
    nearbyEnemies: battleState.enemyUnits.filter((u) => u.state !== 'dead'),
    battlePhase: battleState.phase,
    timeSec: battleState.timeSec,
  };
}
