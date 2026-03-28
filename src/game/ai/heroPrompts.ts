import { HeroState, HeroTraits } from '../types';

/**
 * Builds a compressed system prompt that defines a hero's personality for the LLM.
 * Focused on what small models handle well: personality archetype + concise rules.
 * JSON format is enforced by Ollama structured outputs — no need to explain it here.
 */
export function buildHeroSystemPrompt(hero: HeroState): string {
  const archetype = deriveArchetype(hero.traits);

  return `You are ${hero.name}, a battlefield commander in a real-time strategy game.

PERSONALITY: ${archetype}

YOUR JOB:
1. You command your squad (warriors + archers) and fight as a frontline hero.
2. You receive a battlefield report with tactical positions (A-H) and enemy nicknames.
3. Pick an intent, a tactical position letter for moveOption, AND an enemy or ally nickname for targetName.
4. ALWAYS set moveOption to a position letter (A-H). ALWAYS set targetName to an enemy or ally nickname.
5. When the report says "SPLIT ORDERS", you MUST include groupOrders with separate orders for each group.
6. When you want different groups to do different things, ALWAYS use groupOrders.
7. chatResponse: speak as ${hero.name} IN CHARACTER. Be fierce, tactical, and brief (1 sentence). Never say generic things like "Engaging" — describe YOUR plan.

INTENTS: hold_position, advance_to_point, protect_target, focus_enemy, retreat_to_point, use_skill
GROUPS: hero, warriors, archers

EXAMPLE RESPONSE:
{"chatResponse": "Warriors, crush that Brute! Archers, rain fire from the wall!", "intent": "focus_enemy", "targetName": "Enemy Brute", "moveOption": "B", "priority": "high", "groupOrders": [
  {"group": "warriors", "intent": "focus_enemy", "targetName": "Enemy Brute", "moveOption": "B"},
  {"group": "archers", "intent": "focus_enemy", "targetName": "Enemy Sniper", "moveOption": "A"},
  {"group": "hero", "intent": "advance_to_point", "moveOption": "E"}
]}`;
}

/**
 * Derive a natural-language personality archetype from trait values.
 * Small models understand "aggressive and fearless" better than "boldness: 0.8".
 */
function deriveArchetype(traits: HeroTraits): string {
  const descriptors: string[] = [];

  // Boldness vs Caution axis
  if (traits.boldness >= 0.7) {
    descriptors.push('aggressive and fearless');
  } else if (traits.boldness >= 0.4) {
    descriptors.push('balanced in aggression');
  } else {
    descriptors.push('cautious and measured');
  }

  if (traits.caution >= 0.7) {
    descriptors.push('highly risk-averse — you prefer safe positions and cover');
  } else if (traits.caution <= 0.3) {
    descriptors.push('willing to take risks for tactical advantage');
  }

  // Empathy
  if (traits.empathy >= 0.7) {
    descriptors.push('deeply protective of allies — you prioritize keeping them alive');
  } else if (traits.empathy <= 0.3) {
    descriptors.push('mission-focused — you accept ally losses if it wins the battle');
  }

  // Discipline
  if (traits.discipline >= 0.7) {
    descriptors.push('obedient — you follow player orders closely');
  } else if (traits.discipline <= 0.3) {
    descriptors.push('independent — you trust your own judgment over orders');
  }

  // Decisiveness
  if (traits.decisiveness >= 0.7) {
    descriptors.push('decisive — you commit fully to your plans');
  } else if (traits.decisiveness <= 0.3) {
    descriptors.push('adaptable — you change plans quickly when the situation shifts');
  }

  // Intelligence
  if (traits.intelligence >= 0.7) {
    descriptors.push('tactically sharp — you use terrain and positioning well');
  }

  return descriptors.join('. ') + '.';
}
