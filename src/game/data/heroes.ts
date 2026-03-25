import { HeroConfig, HeroTraits } from '../types';

// ── Personality Presets ──

export const PERSONALITY_PRESETS: Record<string, HeroTraits> = {
  balanced_defender: {
    intelligence: 0.6,
    discipline: 0.7,
    boldness: 0.4,
    caution: 0.6,
    empathy: 0.7,
    decisiveness: 0.5,
  },
  aggressive_commander: {
    intelligence: 0.5,
    discipline: 0.5,
    boldness: 0.9,
    caution: 0.2,
    empathy: 0.3,
    decisiveness: 0.8,
  },
  cautious_guardian: {
    intelligence: 0.7,
    discipline: 0.8,
    boldness: 0.2,
    caution: 0.9,
    empathy: 0.8,
    decisiveness: 0.6,
  },
  reckless_raider: {
    intelligence: 0.4,
    discipline: 0.3,
    boldness: 1.0,
    caution: 0.1,
    empathy: 0.2,
    decisiveness: 0.9,
  },
  support_captain: {
    intelligence: 0.8,
    discipline: 0.7,
    boldness: 0.3,
    caution: 0.5,
    empathy: 1.0,
    decisiveness: 0.4,
  },
};

// ── Default Heroes ──

export const DEFAULT_HEROES: HeroConfig[] = [
  {
    id: 'hero-commander',
    name: 'Commander',
    traits: PERSONALITY_PRESETS.balanced_defender,
  },
];
