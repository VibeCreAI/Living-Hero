import { HeroSummary } from '../types';
import { interpretPlayerMessage } from './PlayerMessageInterpreter';

/**
 * Converts a HeroSummary into a readable battlefield report for the LLM.
 * Optionally appends a player message.
 */
export function buildContextPrompt(
  summary: HeroSummary,
  playerMessage?: string,
  terrainDescription?: string
): string {
  const parsedDirective = playerMessage
    ? interpretPlayerMessage(summary, playerMessage, terrainDescription)
    : null;
  const enemyLabel = summary.mode === 'playground' ? 'TRAINING TARGETS' : 'ENEMY UNITS';
  const scenarioLine =
    summary.mode === 'playground'
      ? 'Playground drill with passive targets. No hostile enemies are present.'
      : 'Live battle.';

  const allies = summary.nearbyAllies
    .filter((u) => u.state !== 'dead')
    .map(
      (u) =>
        `  - ${u.displayName ?? u.role} [${u.id}] HP:${u.hp}/${u.maxHp} at (${Math.round(u.position.x)},${Math.round(u.position.y)}) ${u.state}`
    )
    .join('\n');

  const enemies = summary.nearbyEnemies
    .filter((u) => u.state !== 'dead')
    .map(
      (u) =>
        `  - ${u.displayName ?? u.role} [${u.id}] HP:${u.hp}/${u.maxHp} at (${Math.round(u.position.x)},${Math.round(u.position.y)}) ${u.state}${u.isPassive ? ' passive' : ''}`
    )
    .join('\n');

  const recentDamage = summary.recentDamage
    .filter((event) => event.targetFaction === 'allied')
    .slice(-6)
    .map(
      (event) =>
        `  - ${event.attackerRole} [${event.attackerId}] hit ${event.targetRole} [${event.targetId}] for ${event.damage} at ${event.timeSec.toFixed(1)}s`
    )
    .join('\n');

  let prompt = `BATTLEFIELD REPORT:
- Time: ${summary.timeSec.toFixed(1)}s
- Phase: ${summary.battlePhase}
- Mode: ${summary.mode}
- Scenario: ${scenarioLine}
- Your position: (${Math.round(summary.heroState.position.x)}, ${Math.round(summary.heroState.position.y)})

ALLIED UNITS (${summary.nearbyAllies.filter((u) => u.state !== 'dead').length} alive):
${allies || '  (none)'}

${enemyLabel} (${summary.nearbyEnemies.filter((u) => u.state !== 'dead').length} alive):
${enemies || '  (none)'}

PLAYER DIRECTIVE: ${summary.currentDirective ? `"${summary.currentDirective}"` : 'none'}

RECENT DAMAGE TO ALLIES:
${recentDamage || '  (none in the last few seconds)'}

TERRAIN:
${terrainDescription || '  Open field, no obstacles.'}

MAP COORDINATES:
- Map size is 1024 by 768.
- (0,0) is the top-left corner.
- x increases toward the east/right.
- y increases toward the south/down.
- north/top means smaller y.
- south/bottom means larger y.
- west/left means smaller x.
- east/right means larger x.
- Clock directions use the same frame: 12 o'clock = north/top, 3 o'clock = east/right, 6 o'clock = south/bottom, 9 o'clock = west/left.
- Intermediate clock directions are diagonals: 1-2 = northeast, 4-5 = southeast, 7-8 = southwest, 10-11 = northwest.`;

  if (playerMessage) {
    prompt += `\n\nPLAYER SAYS: "${playerMessage}"`;
    if (parsedDirective) {
      prompt += `\nDIRECTIVE INTERPRETATION HINT:
- Parsed directive: ${formatDirectiveHint(parsedDirective)}
- Cardinal references in player directives should use the map coordinate rules above exactly.`;
      if (parsedDirective.groupOrders?.length) {
        prompt += `\n- The player's directive explicitly implies split squad orders.
${parsedDirective.groupOrders.map((groupOrder) => formatDirectiveGroupHint(groupOrder)).join('\n')}`;
      }
    }
  } else {
    prompt += '\n\nNo new orders. Reassess the situation and decide.';
  }

  return prompt;
}

function formatDirectiveGroupHint(groupOrder: {
  group: string;
  intent: string;
  targetId?: string;
  moveTo?: { x: number; y: number };
}): string {
  const parts = [`- ${groupOrder.group}: ${groupOrder.intent}`];
  if (groupOrder.targetId) {
    parts.push(`target ${groupOrder.targetId}`);
  }
  if (groupOrder.moveTo) {
    parts.push(`move (${Math.round(groupOrder.moveTo.x)}, ${Math.round(groupOrder.moveTo.y)})`);
  }

  return parts.join(' | ');
}

function formatDirectiveHint(directive: {
  intent: string;
  targetId?: string;
  moveTo?: { x: number; y: number };
}): string {
  const parts = [directive.intent];
  if (directive.targetId) {
    parts.push(`target ${directive.targetId}`);
  }
  if (directive.moveTo) {
    parts.push(`move (${Math.round(directive.moveTo.x)}, ${Math.round(directive.moveTo.y)})`);
  }

  return parts.join(' | ');
}
