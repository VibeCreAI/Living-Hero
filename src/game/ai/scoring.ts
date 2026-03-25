import { HeroSummary, HeroTraits } from '../types';
import { Candidate } from './candidates';
import { AI_CONFIG } from './config';

/** Linear interpolation: trait value 0-1 maps to [min, max]. */
function scale(trait: number, range: [number, number]): number {
  return range[0] + trait * (range[1] - range[0]);
}

/** Context-independent base score for each intent type. */
export function baseScore(candidate: Candidate, summary: HeroSummary): number {
  const cfg = AI_CONFIG.baseScores;

  // Estimate army HP by averaging allies
  const allyHpPct = summary.nearbyAllies.length > 0
    ? summary.nearbyAllies.reduce((sum, a) => sum + a.hp / a.maxHp, 0) / summary.nearbyAllies.length
    : 1;

  switch (candidate.intent) {
    case 'advance_to_point':
      return summary.nearbyEnemies.length > 0 ? cfg.advance_to_point : 0;
    case 'protect_target':
      return summary.nearbyAllies.length > 0 ? cfg.protect_target : 0;
    case 'focus_enemy':
      return summary.nearbyEnemies.length > 0 ? cfg.focus_enemy : 0;
    case 'retreat_to_point':
      return allyHpPct < AI_CONFIG.retreatHpThreshold
        ? cfg.retreat_to_point_emergency
        : cfg.retreat_to_point_normal;
    case 'hold_position':
      return cfg.hold_position;
    case 'use_skill':
      return cfg.use_skill;
  }
}

/** Personality-driven score modifiers based on hero traits. */
export function personalityScore(candidate: Candidate, _summary: HeroSummary, traits: HeroTraits): number {
  let score = 0;
  const p = AI_CONFIG.personality;

  switch (candidate.intent) {
    case 'advance_to_point':
      score += scale(traits.boldness, p.advanceBoldness);
      score -= scale(traits.caution, p.advanceCaution);
      break;
    case 'retreat_to_point':
      score += scale(traits.caution, p.retreatCaution);
      score -= scale(traits.boldness, p.retreatBoldness);
      break;
    case 'protect_target':
      score += scale(traits.empathy, p.protectEmpathy);
      break;
    case 'focus_enemy':
      score += scale(traits.boldness, p.focusBoldness);
      break;
    case 'hold_position':
      score += scale(traits.discipline, p.holdDiscipline);
      break;
  }

  return score;
}

/** Boost score when the candidate matches the player's command. */
export function commandBoost(candidate: Candidate, summary: HeroSummary, traits: HeroTraits): number {
  if (!summary.currentCommand) return 0;

  const boost = AI_CONFIG.commandBoost;

  switch (summary.currentCommand.type) {
    case 'protect':
      return candidate.intent === 'protect_target' ? scale(traits.discipline, boost.protect) : 0;
    case 'advance':
      return candidate.intent === 'advance_to_point' ? scale(traits.discipline, boost.advance) : 0;
    case 'hold':
      return candidate.intent === 'hold_position' ? scale(traits.discipline, boost.hold) : 0;
    case 'focus':
      return candidate.intent === 'focus_enemy' ? scale(traits.discipline, boost.focus) : 0;
  }
}

/** Total score = base + personality + command boost. */
export function totalScore(candidate: Candidate, summary: HeroSummary, traits: HeroTraits): number {
  return baseScore(candidate, summary)
    + personalityScore(candidate, summary, traits)
    + commandBoost(candidate, summary, traits);
}
