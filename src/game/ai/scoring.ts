import { HeroSummary, HeroTraits } from '../types';
import { Candidate } from './candidates';
import { AI_CONFIG } from './config';
import { scoreTacticalPosition, TacticalIntent } from './cover';

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

function tacticalPositionScore(candidate: Candidate, summary: HeroSummary): number {
  if (!candidate.moveTo) {
    return 0;
  }

  const intent = toTacticalIntent(candidate.intent);
  if (!intent) {
    return 0;
  }

  const anchor =
    candidate.intent === 'protect_target'
      ? summary.nearbyAllies.find((ally) => ally.id === candidate.targetId)?.position
        ?? summary.heroState.position
      : candidate.intent === 'advance_to_point'
        ? clusterCenter(summary.nearbyEnemies) ?? summary.heroState.position
        : candidate.intent === 'retreat_to_point'
          ? clusterCenter(summary.nearbyAllies) ?? summary.heroState.position
          : summary.heroState.position;

  return scoreTacticalPosition(summary, candidate.moveTo, intent, anchor) * 0.08;
}

/** Total score = base + personality + tactical position. */
export function totalScore(candidate: Candidate, summary: HeroSummary, traits: HeroTraits): number {
  return baseScore(candidate, summary)
    + personalityScore(candidate, summary, traits)
    + tacticalPositionScore(candidate, summary);
}

function toTacticalIntent(intent: Candidate['intent']): TacticalIntent | null {
  switch (intent) {
    case 'advance_to_point':
      return 'advance';
    case 'hold_position':
      return 'hold';
    case 'protect_target':
      return 'protect';
    case 'retreat_to_point':
      return 'retreat';
    default:
      return null;
  }
}

function clusterCenter(units: { position: { x: number; y: number } }[]): { x: number; y: number } | undefined {
  if (units.length === 0) {
    return undefined;
  }

  let sumX = 0;
  let sumY = 0;
  for (const unit of units) {
    sumX += unit.position.x;
    sumY += unit.position.y;
  }

  return {
    x: sumX / units.length,
    y: sumY / units.length,
  };
}
