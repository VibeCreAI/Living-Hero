import { HeroDecision } from '../types';
import { Candidate } from './candidates';
import { AI_CONFIG } from './config';

/**
 * Select the best candidate, with hysteresis to prevent flip-flopping.
 * If the current intent is close in score to the best, keep the current one.
 */
export function selectBest(
  candidates: Candidate[],
  scores: number[],
  lastDecision?: HeroDecision
): Candidate {
  if (candidates.length === 0) {
    return { intent: 'hold_position' };
  }

  let bestIndex = 0;
  let bestScore = scores[0];
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > bestScore) {
      bestScore = scores[i];
      bestIndex = i;
    }
  }

  // Hysteresis: prefer keeping current intent unless the best is significantly better
  if (lastDecision) {
    const lastIndex = candidates.findIndex((c) => c.intent === lastDecision.intent);
    if (lastIndex >= 0) {
      const delta = scores[bestIndex] - scores[lastIndex];
      if (delta < AI_CONFIG.switchThreshold) {
        return candidates[lastIndex];
      }
    }
  }

  return candidates[bestIndex];
}
