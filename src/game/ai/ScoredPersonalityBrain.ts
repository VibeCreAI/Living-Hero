import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { HeroSummary, HeroDecision, HeroTraits } from '../types';
import { generateCandidates, Candidate } from './candidates';
import { totalScore } from './scoring';
import { selectBest } from './selector';
import { AI_CONFIG } from './config';

/** Rationale tag describing why a candidate was chosen. */
function buildRationale(candidate: Candidate, summary: HeroSummary): string {
  switch (candidate.intent) {
    case 'advance_to_point':
      return summary.nearbyEnemies.length > summary.nearbyAllies.length
        ? 'advance_outnumbered'
        : 'advance_with_advantage';
    case 'protect_target':
      return candidate.targetId ? 'protect_weak_ally' : 'protect_cluster';
    case 'focus_enemy':
      return 'focus_weak_target';
    case 'retreat_to_point': {
      const allyHpPct = summary.nearbyAllies.length > 0
        ? summary.nearbyAllies.reduce((s, a) => s + a.hp / a.maxHp, 0) / summary.nearbyAllies.length
        : 1;
      return allyHpPct < AI_CONFIG.retreatHpThreshold ? 'retreat_low_hp' : 'retreat_reposition';
    }
    case 'hold_position':
      return summary.currentCommand?.type === 'hold' ? 'hold_ordered' : 'hold_default';
    case 'use_skill':
      return 'use_skill_tactical';
  }
}

/**
 * Personality-driven hero brain that:
 * 1. Generates candidate intents
 * 2. Scores them using heuristics + personality traits
 * 3. Selects with hysteresis for stability
 *
 * Fully replaceable by OllamaHeroBrain later.
 */
export class ScoredPersonalityBrain implements IHeroDecisionProvider {
  private traits: HeroTraits;
  private lastDecision?: HeroDecision;
  private lastDecisionTime: number = 0;

  constructor(traits: HeroTraits) {
    this.traits = traits;
  }

  decide(summary: HeroSummary): HeroDecision {
    // Commitment check: don't switch too fast based on decisiveness
    const minHold = AI_CONFIG.minHoldTime.base + this.traits.decisiveness * AI_CONFIG.minHoldTime.scale;
    const timeSinceLastDecision = summary.timeSec - this.lastDecisionTime;

    if (this.lastDecision && timeSinceLastDecision < minHold) {
      // Check for emergency override (ally army critically low)
      const allyHpPct = summary.nearbyAllies.length > 0
        ? summary.nearbyAllies.reduce((s, a) => s + a.hp / a.maxHp, 0) / summary.nearbyAllies.length
        : 1;
      const isEmergency = allyHpPct < 0.2;

      if (!isEmergency) {
        // Not an emergency and within commitment window — keep current decision
        return this.lastDecision;
      }
    }

    // 1. Generate candidates
    const candidates = generateCandidates(summary);

    // 2. Score all candidates
    const scores = candidates.map((c) => totalScore(c, summary, this.traits));

    // 3. Select with hysteresis
    const selected = selectBest(candidates, scores, this.lastDecision);

    // 4. Build decision
    const recheckInSec = AI_CONFIG.recheckInterval.base
      + (1 - this.traits.decisiveness) * AI_CONFIG.recheckInterval.scale;

    const decision: HeroDecision = {
      intent: selected.intent,
      targetId: selected.targetId,
      moveTo: selected.moveTo,
      skillId: selected.skillId,
      priority: this.derivePriority(selected, summary),
      rationaleTag: buildRationale(selected, summary),
      recheckInSec,
    };

    // 5. Validate
    if (decision.moveTo) {
      decision.moveTo.x = Math.max(20, Math.min(1004, decision.moveTo.x));
      decision.moveTo.y = Math.max(20, Math.min(748, decision.moveTo.y));
    }

    if (decision.targetId) {
      const targetExists = summary.nearbyEnemies.some((e) => e.id === decision.targetId)
        || summary.nearbyAllies.some((a) => a.id === decision.targetId);
      if (!targetExists) {
        decision.targetId = undefined;
      }
    }

    this.lastDecision = decision;
    this.lastDecisionTime = summary.timeSec;

    return decision;
  }

  private derivePriority(
    candidate: Candidate,
    summary: HeroSummary
  ): 'low' | 'medium' | 'high' {
    if (candidate.intent === 'retreat_to_point') {
      const allyHpPct = summary.nearbyAllies.length > 0
        ? summary.nearbyAllies.reduce((s, a) => s + a.hp / a.maxHp, 0) / summary.nearbyAllies.length
        : 1;
      return allyHpPct < AI_CONFIG.retreatHpThreshold ? 'high' : 'low';
    }
    if (candidate.intent === 'focus_enemy' && summary.currentCommand?.type === 'focus') {
      return 'high';
    }
    return 'medium';
  }
}
