import { HeroSummary, UnitState, Position } from '../types';
import { BattleVocabulary, positionToRegion } from './BattleVocabulary';
import {
  TacticalPositionMenuResult,
  formatPositionMenuForPrompt,
} from './TacticalPositionMenu';
import { interpretPlayerMessage } from './PlayerMessageInterpreter';

/**
 * Build context for the LLM.
 * Now returns both the prompt AND the supporting data the normalizer needs.
 */
export interface ContextBuildResult {
  prompt: string;
  positionMenu: TacticalPositionMenuResult;
  vocabulary: BattleVocabulary;
}

/**
 * Converts a HeroSummary into a compressed battlefield report for the LLM.
 * Uses nicknames + tactical position menu instead of raw IDs + coordinates.
 */
export function buildContextPrompt(
  summary: HeroSummary,
  positionMenu: TacticalPositionMenuResult,
  vocabulary: BattleVocabulary,
  playerMessage?: string,
  terrainDescription?: string
): string {
  const parsedDirective = playerMessage
    ? interpretPlayerMessage(summary, playerMessage, terrainDescription)
    : null;
  const enemyLabel = summary.mode === 'playground' ? 'TRAINING TARGETS' : 'ENEMIES';
  const scenarioLine =
    summary.mode === 'playground'
      ? 'Playground drill. Targets are passive.'
      : 'Live battle.';

  // Aggregate allies by role
  const aliveAllies = summary.nearbyAllies.filter((u) => u.state !== 'dead');
  const aliveEnemies = summary.nearbyEnemies.filter((u) => u.state !== 'dead');

  const alliesSection = formatUnitList(aliveAllies, vocabulary, positionMenu);
  const enemiesSection = formatUnitList(aliveEnemies, vocabulary, positionMenu);

  // Aggregate recent damage
  const damageSection = formatDamageSummary(summary, vocabulary);

  // Hero position reference
  const heroRegion = positionToRegion(summary.heroState.position);
  const heroNearPos = findNearestPositionLabel(summary.heroState.position, positionMenu);

  let prompt = `BATTLE REPORT (${summary.timeSec.toFixed(0)}s, ${summary.battlePhase}):
${scenarioLine}
Hero: ${summary.heroState.name} HP:${formatHeroHp(summary)} at ${heroRegion}${heroNearPos ? ` near pos-${heroNearPos}` : ''}

ALLIES (${aliveAllies.length}):
${alliesSection || '  none'}

${enemyLabel} (${aliveEnemies.length}):
${enemiesSection || '  none'}

${formatPositionMenuForPrompt(positionMenu)}`;

  if (damageSection) {
    prompt += `\n\nRECENT DAMAGE: ${damageSection}`;
  }

  if (playerMessage) {
    prompt += `\n\nPLAYER SAYS: "${playerMessage}"`;
    if (parsedDirective) {
      prompt += `\nHINT: ${formatDirectiveHint(parsedDirective, positionMenu)}`;
      if (parsedDirective.groupOrders?.length) {
        prompt += '\nSPLIT ORDERS — you MUST use groupOrders in your response:';
        for (const go of parsedDirective.groupOrders) {
          const targetNick = go.targetId ? vocabulary.getNickname(go.targetId) : '';
          const posLabel = go.moveTo
            ? findNearestPositionLabel(go.moveTo, positionMenu) ?? positionToRegion(go.moveTo)
            : '';
          const parts = [`  ${go.group}: ${go.intent}`];
          if (targetNick) parts.push(`target ${targetNick}`);
          if (posLabel) parts.push(`at pos-${posLabel}`);
          prompt += `\n${parts.join(' | ')}`;
        }
        prompt += '\nFollow this assignment. Each group gets its own order in groupOrders.';
      }
    }
  } else {
    prompt += `\n\n${buildSituationalNudge(summary, vocabulary, positionMenu)}`;
  }

  return prompt;
}

// ── Unit formatting ──

function formatUnitList(
  units: UnitState[],
  vocabulary: BattleVocabulary,
  positionMenu: TacticalPositionMenuResult
): string {
  return units
    .map((u) => {
      const nick = vocabulary.getNickname(u.id);
      const hpPct = Math.round((u.hp / u.maxHp) * 100);
      const region = positionToRegion(u.position);
      const nearPos = findNearestPositionLabel(u.position, positionMenu);
      const posStr = nearPos ? `near pos-${nearPos}` : region;
      return `  ${nick} (${u.role}) HP:${hpPct}% ${posStr} ${u.state}${u.isPassive ? ' passive' : ''}`;
    })
    .join('\n');
}

// ── Damage aggregation ──

function formatDamageSummary(
  summary: HeroSummary,
  vocabulary: BattleVocabulary
): string {
  const alliedDamage = summary.recentDamage.filter((e) => e.targetFaction === 'allied');
  if (alliedDamage.length === 0) return '';

  // Aggregate by attacker
  const byAttacker = new Map<string, { total: number; victims: Set<string> }>();
  for (const event of alliedDamage.slice(-8)) {
    const key = event.attackerId;
    const existing = byAttacker.get(key) ?? { total: 0, victims: new Set() };
    existing.total += event.damage;
    existing.victims.add(event.targetId);
    byAttacker.set(key, existing);
  }

  const parts: string[] = [];
  for (const [attackerId, info] of byAttacker) {
    const attackerNick = vocabulary.getNickname(attackerId);
    const victimNames = [...info.victims].map((id) => vocabulary.getNickname(id)).join(', ');
    parts.push(`${attackerNick} dealt ${info.total} dmg to ${victimNames}`);
  }

  return parts.join('; ');
}

// ── Situational nudges (for autonomous decisions) ──

function buildSituationalNudge(
  summary: HeroSummary,
  vocabulary: BattleVocabulary,
  positionMenu: TacticalPositionMenuResult
): string {
  const aliveAllies = summary.nearbyAllies.filter((u) => u.state !== 'dead');
  const aliveEnemies = summary.nearbyEnemies.filter((u) => u.state !== 'dead');

  // Critical ally
  const criticalAlly = aliveAllies.find((u) => u.hp / u.maxHp < 0.3);
  if (criticalAlly) {
    const nick = vocabulary.getNickname(criticalAlly.id);
    const hpPct = Math.round((criticalAlly.hp / criticalAlly.maxHp) * 100);
    return `NO NEW ORDERS. ${nick} is at ${hpPct}% HP and in danger. Protect or reposition?`;
  }

  // Heavy incoming damage
  const recentAlliedDmg = summary.recentDamage
    .filter((e) => e.targetFaction === 'allied')
    .slice(-6);
  if (recentAlliedDmg.length >= 3) {
    const topAttacker = findTopAttacker(recentAlliedDmg);
    if (topAttacker) {
      const nick = vocabulary.getNickname(topAttacker);
      return `NO NEW ORDERS. Your troops are under heavy fire from ${nick}. React.`;
    }
  }

  // Outnumbered
  if (aliveEnemies.length > aliveAllies.length + 1) {
    return `NO NEW ORDERS. You're outnumbered ${aliveEnemies.length} to ${aliveAllies.length}. What's your plan?`;
  }

  // Winning
  if (aliveEnemies.length <= 2 && aliveAllies.length >= 3) {
    return `NO NEW ORDERS. The enemy is weakened. Press the advantage or consolidate?`;
  }

  // Stalemate / idle
  const heroNearPos = findNearestPositionLabel(summary.heroState.position, positionMenu);
  const enemyRegion = aliveEnemies.length > 0
    ? positionToRegion(clusterCenter(aliveEnemies)!)
    : 'unknown';
  return `NO NEW ORDERS. You're at ${heroNearPos ? `pos-${heroNearPos}` : positionToRegion(summary.heroState.position)}. Enemies are ${enemyRegion}. Decide your next move.`;
}

function findTopAttacker(events: { attackerId: string }[]): string | undefined {
  const counts = new Map<string, number>();
  for (const e of events) {
    counts.set(e.attackerId, (counts.get(e.attackerId) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = id;
    }
  }
  return best;
}

// ── Helpers ──

function formatHeroHp(summary: HeroSummary): string {
  if (!summary.heroUnit) return 'N/A';
  return `${summary.heroUnit.hp}/${summary.heroUnit.maxHp}`;
}

function formatDirectiveHint(
  directive: { intent: string; targetId?: string; moveTo?: { x: number; y: number } },
  positionMenu: TacticalPositionMenuResult
): string {
  const parts = [directive.intent];
  if (directive.targetId) parts.push(`target ${directive.targetId}`);
  if (directive.moveTo) {
    const posLabel = findNearestPositionLabel(directive.moveTo, positionMenu);
    parts.push(posLabel ? `pos-${posLabel}` : `(${Math.round(directive.moveTo.x)}, ${Math.round(directive.moveTo.y)})`);
  }
  return parts.join(' | ');
}

/** Find the nearest tactical position label for a given coordinate */
function findNearestPositionLabel(
  pos: Position,
  menu: TacticalPositionMenuResult
): string | undefined {
  let bestLabel: string | undefined;
  let bestDist = 80; // Only match if within 80px

  for (const tp of menu.positions) {
    const d = Math.hypot(pos.x - tp.coords.x, pos.y - tp.coords.y);
    if (d < bestDist) {
      bestDist = d;
      bestLabel = tp.label;
    }
  }

  return bestLabel;
}

function clusterCenter(units: { position: Position }[]): Position | undefined {
  if (units.length === 0) return undefined;
  let sx = 0, sy = 0;
  for (const u of units) { sx += u.position.x; sy += u.position.y; }
  return { x: sx / units.length, y: sy / units.length };
}
