import { HeroState, BattleState, HeroSummary } from '../types';

export function buildHeroSummary(
  heroState: HeroState,
  battleState: BattleState
): HeroSummary {
  return {
    mode: battleState.mode,
    heroState,
    currentDirective: heroState.currentDirective,
    nearbyAllies: battleState.alliedUnits.filter((u) => u.state !== 'dead'),
    nearbyEnemies: battleState.enemyUnits.filter((u) => u.state !== 'dead'),
    obstacles: battleState.obstacles,
    recentDamage: battleState.recentDamage,
    battlePhase: battleState.phase,
    timeSec: battleState.timeSec,
  };
}
