import { HeroSummary, TileCoord, UnitState } from '../types';
import { BattleVocabulary, positionToRegion, tileToRegion } from './BattleVocabulary';
import {
  TacticalPositionMenuResult,
  formatPositionMenuForPrompt,
} from './TacticalPositionMenu';
import { interpretPlayerMessage } from './PlayerMessageInterpreter';

export interface ContextBuildResult {
  prompt: string;
  positionMenu: TacticalPositionMenuResult;
  vocabulary: BattleVocabulary;
}

export function buildContextPrompt(
  summary: HeroSummary,
  positionMenu: TacticalPositionMenuResult,
  vocabulary: BattleVocabulary,
  playerMessage?: string,
  terrainDescription?: string,
  options: { openingStrategy?: boolean } = {}
): string {
  const parsedDirective = playerMessage
    ? interpretPlayerMessage(summary, playerMessage, terrainDescription)
    : null;
  const enemyLabel = summary.mode === 'playground' ? 'TRAINING TARGETS' : 'ENEMIES';
  const scenarioLine =
    summary.mode === 'playground'
      ? 'Playground drill. Targets are passive.'
      : 'Live battle.';

  const aliveAllies = summary.nearbyAllies.filter((unit) => unit.state !== 'dead');
  const aliveEnemies = summary.nearbyEnemies.filter((unit) => unit.state !== 'dead');
  const alliesSection = formatUnitList(summary, aliveAllies, vocabulary, positionMenu);
  const enemiesSection = formatUnitList(summary, aliveEnemies, vocabulary, positionMenu);
  const groupSection = formatGroupStatus(summary, aliveAllies, positionMenu);
  const damageSection = formatDamageSummary(summary, vocabulary);

  const heroRegion = tileToRegion(summary.heroState.tile, summary.grid);
  const heroNearPos = findNearestPositionLabel(summary.heroState.tile, positionMenu);

  let prompt = `BATTLE REPORT (${summary.timeSec.toFixed(0)}s, ${summary.battlePhase}):
${scenarioLine}
Hero: ${summary.heroState.name} HP:${formatHeroHp(summary)} at ${heroRegion}${heroNearPos ? ` near pos-${heroNearPos}` : ''} tile ${formatTile(summary.heroState.tile)}

ALLIES (${aliveAllies.length}):
${alliesSection || '  none'}

${enemyLabel} (${aliveEnemies.length}):
${enemiesSection || '  none'}

GROUP STATUS:
${groupSection}

${formatPositionMenuForPrompt(positionMenu)}`;

  if (options.openingStrategy) {
    prompt += `\n\nOPENING STRATEGY PRIORITY:
This is the first battle plan before combat begins.
Spend extra care on terrain, first contact, group spacing, target priority, and whether the opening should hold, advance, screen, or focus.
Prefer one coherent opener over a reactive or generic move.`;
  }

  if (damageSection) {
    prompt += `\n\nRECENT DAMAGE: ${damageSection}`;
  }

  if (playerMessage) {
    prompt += `\n\nPLAYER SAYS: "${playerMessage}"`;
    if (parsedDirective) {
      prompt += '\nRULE PARSER: structured directive detected.';
      prompt += `\nHINT: ${formatDirectiveHint(parsedDirective, positionMenu)}`;
      if (parsedDirective.groupOrders?.length) {
        prompt += '\nSPLIT ORDERS - you MUST use groupOrders in your response:';
        for (const groupOrder of parsedDirective.groupOrders) {
          const targetNick = groupOrder.targetId ? vocabulary.getNickname(groupOrder.targetId) : '';
          const posLabel = groupOrder.moveToTile
            ? findNearestPositionLabel(groupOrder.moveToTile, positionMenu) ??
              formatTile(groupOrder.moveToTile)
            : '';
          const parts = [`  ${groupOrder.group}: ${groupOrder.intent}`];
          if (targetNick) parts.push(`target ${targetNick}`);
          if (posLabel) parts.push(`at ${posLabel.startsWith('[') ? `tile ${posLabel}` : `pos-${posLabel}`}`);
          prompt += `\n${parts.join(' | ')}`;
        }
        prompt += '\nFollow this assignment. Each group gets its own order in groupOrders.';
      }
      prompt += '\nLeave playerOrderInterpretation empty unless the player order contains extra executable detail not captured by the hint.';
    } else {
      prompt += '\nRULE PARSER: no structured directive detected.';
      prompt += '\nIf the player order is still clear and executable, translate it into playerOrderInterpretation.';
      prompt += '\nIf the wording is too vague or not actionable, leave playerOrderInterpretation empty and make your own tactical decision.';
    }
  } else {
    prompt += `\n\n${buildSituationalNudge(summary, vocabulary, positionMenu)}`;
  }

  prompt += '\n\nGROUP ORDER RULE: If warriors, ranged units, and hero should do different things, include groupOrders. Use the archers group for ranged units in JSON. If groupOrders is empty, chatResponse must describe one army-wide plan only.';
  prompt += '\nchatResponse must be a non-empty spoken order.';
  prompt += '\nPLAYER ORDER FALLBACK RULE: chatResponse must describe the top-level tactical decision only. Use playerOrderInterpretation only as an optional structured translation of PLAYER SAYS.';

  return prompt;
}

function formatUnitList(
  summary: HeroSummary,
  units: UnitState[],
  vocabulary: BattleVocabulary,
  positionMenu: TacticalPositionMenuResult
): string {
  return units
    .map((unit) => {
      const nick = vocabulary.getNickname(unit.id);
      const hpPct = Math.round((unit.hp / unit.maxHp) * 100);
      const region = tileToRegion(unit.tile, summary.grid);
      const nearPos = findNearestPositionLabel(unit.tile, positionMenu);
      const posStr = nearPos ? `near pos-${nearPos}` : region;
      return `  ${nick} (${unit.role}) HP:${hpPct}% ${posStr} tile ${formatTile(unit.tile)} ${unit.state}${unit.isPassive ? ' passive' : ''}`;
    })
    .join('\n');
}

function formatDamageSummary(summary: HeroSummary, vocabulary: BattleVocabulary): string {
  const alliedDamage = summary.recentDamage.filter((event) => event.targetFaction === 'allied');
  if (alliedDamage.length === 0) {
    return '';
  }

  const byAttacker = new Map<string, { total: number; victims: Set<string> }>();
  for (const event of alliedDamage.slice(-8)) {
    const existing = byAttacker.get(event.attackerId) ?? { total: 0, victims: new Set<string>() };
    existing.total += event.damage;
    existing.victims.add(event.targetId);
    byAttacker.set(event.attackerId, existing);
  }

  const parts: string[] = [];
  for (const [attackerId, info] of byAttacker) {
    const attackerNick = vocabulary.getNickname(attackerId);
    const victimNames = [...info.victims].map((id) => vocabulary.getNickname(id)).join(', ');
    parts.push(`${attackerNick} dealt ${info.total} dmg to ${victimNames}`);
  }

  return parts.join('; ');
}

function formatGroupStatus(
  summary: HeroSummary,
  allies: UnitState[],
  positionMenu: TacticalPositionMenuResult
): string {
  const heroUnit = summary.heroUnit;
  const warriors = allies.filter((unit) => unit.role === 'warrior');
  const archers = allies.filter((unit) => unit.role === 'archer');

  return [
    formatGroupLine('hero', heroUnit ? [heroUnit] : [], positionMenu),
    formatGroupLine('warriors', warriors, positionMenu),
    formatGroupLine('archers', archers, positionMenu),
  ].join('\n');
}

function formatGroupLine(
  label: string,
  units: UnitState[],
  positionMenu: TacticalPositionMenuResult
): string {
  if (units.length === 0) {
    return `  ${label}: none`;
  }

  const center = clusterCenterTiles(units.map((unit) => unit.tile)) ?? units[0].tile;
  const nearPos = findNearestPositionLabel(center, positionMenu);
  const location = nearPos ? `near pos-${nearPos}` : `tile ${formatTile(center)}`;
  return `  ${label} (${units.length}): ${location}`;
}

function buildSituationalNudge(
  summary: HeroSummary,
  vocabulary: BattleVocabulary,
  positionMenu: TacticalPositionMenuResult
): string {
  const aliveAllies = summary.nearbyAllies.filter((unit) => unit.state !== 'dead');
  const aliveEnemies = summary.nearbyEnemies.filter((unit) => unit.state !== 'dead');

  const criticalAlly = aliveAllies.find((unit) => unit.hp / unit.maxHp < 0.3);
  if (criticalAlly) {
    const nick = vocabulary.getNickname(criticalAlly.id);
    const hpPct = Math.round((criticalAlly.hp / criticalAlly.maxHp) * 100);
    return `NO NEW ORDERS. ${nick} is at ${hpPct}% HP and in danger. Protect or reposition?`;
  }

  const recentAlliedDamage = summary.recentDamage
    .filter((event) => event.targetFaction === 'allied')
    .slice(-6);
  if (recentAlliedDamage.length >= 3) {
    const topAttacker = findTopAttacker(recentAlliedDamage);
    if (topAttacker) {
      return `NO NEW ORDERS. Your troops are under heavy fire from ${vocabulary.getNickname(topAttacker)}. React.`;
    }
  }

  if (aliveEnemies.length > aliveAllies.length + 1) {
    return `NO NEW ORDERS. You're outnumbered ${aliveEnemies.length} to ${aliveAllies.length}. What's your plan?`;
  }

  if (aliveEnemies.length <= 2 && aliveAllies.length >= 3) {
    return `NO NEW ORDERS. The enemy is weakened. Press the advantage or consolidate?`;
  }

  const heroNearPos = findNearestPositionLabel(summary.heroState.tile, positionMenu);
  const enemyRegion =
    aliveEnemies.length > 0
      ? positionToRegion(clusterCenter(aliveEnemies.map((enemy) => enemy.position))!, summary.grid)
      : 'unknown';
  return `NO NEW ORDERS. You're at ${heroNearPos ? `pos-${heroNearPos}` : formatTile(summary.heroState.tile)}. Enemies are ${enemyRegion}. Decide your next move.`;
}

function findTopAttacker(events: { attackerId: string }[]): string | undefined {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.attackerId, (counts.get(event.attackerId) ?? 0) + 1);
  }

  let best: string | undefined;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

function formatHeroHp(summary: HeroSummary): string {
  if (!summary.heroUnit) {
    return 'N/A';
  }
  return `${summary.heroUnit.hp}/${summary.heroUnit.maxHp}`;
}

function formatDirectiveHint(
  directive: { intent: string; targetId?: string; moveToTile?: TileCoord },
  positionMenu: TacticalPositionMenuResult
): string {
  const parts = [directive.intent];
  if (directive.targetId) {
    parts.push(`target ${directive.targetId}`);
  }
  if (directive.moveToTile) {
    const posLabel = findNearestPositionLabel(directive.moveToTile, positionMenu);
    parts.push(posLabel ? `pos-${posLabel}` : `tile ${formatTile(directive.moveToTile)}`);
  }
  return parts.join(' | ');
}

function findNearestPositionLabel(
  tile: TileCoord,
  menu: TacticalPositionMenuResult
): string | undefined {
  let bestLabel: string | undefined;
  let bestDist = 2.5;

  for (const tacticalPosition of menu.positions) {
    const distance = Math.hypot(
      tile.col - tacticalPosition.tile.col,
      tile.row - tacticalPosition.tile.row
    );
    if (distance < bestDist) {
      bestDist = distance;
      bestLabel = tacticalPosition.label;
    }
  }

  return bestLabel;
}

function formatTile(tile: TileCoord): string {
  return `[${tile.col},${tile.row}]`;
}

function clusterCenter(points: { x: number; y: number }[]): { x: number; y: number } | undefined {
  if (points.length === 0) {
    return undefined;
  }

  let sx = 0;
  let sy = 0;
  for (const point of points) {
    sx += point.x;
    sy += point.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function clusterCenterTiles(tiles: TileCoord[]): TileCoord | undefined {
  if (tiles.length === 0) {
    return undefined;
  }

  let sumCol = 0;
  let sumRow = 0;
  for (const tile of tiles) {
    sumCol += tile.col;
    sumRow += tile.row;
  }

  return {
    col: Math.round(sumCol / tiles.length),
    row: Math.round(sumRow / tiles.length),
  };
}
