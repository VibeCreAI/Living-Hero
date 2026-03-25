import { BattleState } from '../types';
import { Hero } from '../entities/Hero';
import { Unit } from '../entities/Unit';
import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { IntentExecutor } from './IntentExecutor';
import { buildHeroSummary } from './HeroSummaryBuilder';

export class HeroScheduler {
  private decisionProvider: IHeroDecisionProvider;
  private intentExecutor: IntentExecutor;
  private timers: Map<string, number> = new Map();

  constructor(decisionProvider: IHeroDecisionProvider) {
    this.decisionProvider = decisionProvider;
    this.intentExecutor = new IntentExecutor();
  }

  update(
    dt: number,
    heroes: Hero[],
    battleState: BattleState,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): void {
    for (const hero of heroes) {
      const elapsed = (this.timers.get(hero.state.id) ?? 0) + dt;
      const recheckInterval = hero.state.currentDecision?.recheckInSec ?? 0;

      if (elapsed >= recheckInterval) {
        // Time to make a new decision
        const summary = buildHeroSummary(hero.state, battleState);
        const decision = this.decisionProvider.decide(summary);

        hero.setDecision(decision);
        this.intentExecutor.execute(hero, decision, alliedUnits, enemyUnits);
        this.timers.set(hero.state.id, 0);
      } else {
        this.timers.set(hero.state.id, elapsed);
      }
    }
  }
}
