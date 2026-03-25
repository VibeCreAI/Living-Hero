import { HeroSummary, HeroDecision } from '../types';

export interface IHeroDecisionProvider {
  decide(summary: HeroSummary): HeroDecision;
}
