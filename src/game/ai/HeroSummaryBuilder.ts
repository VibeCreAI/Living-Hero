import { HeroState, BattleState, HeroSummary } from '../types';

export function buildHeroSummary(
  heroState: HeroState,
  battleState: BattleState
): HeroSummary {
  const heroUnit = battleState.alliedUnits.find((unit) => unit.id === heroState.combatUnitId);

  return {
    mode: battleState.mode,
    heroState,
    heroUnit,
    currentDirective: heroState.currentDirective,
    nearbyAllies: battleState.alliedUnits.filter(
      (unit) =>
        unit.state !== 'dead' &&
        unit.role !== 'hero' &&
        unit.assignedHeroId === heroState.id
    ),
    nearbyEnemies: battleState.enemyUnits.filter((u) => u.state !== 'dead'),
    obstacles: battleState.obstacles,
    recentDamage: battleState.recentDamage,
    battlePhase: battleState.phase,
    timeSec: battleState.timeSec,
  };
}
