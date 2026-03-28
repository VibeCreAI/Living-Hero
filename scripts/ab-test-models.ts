/**
 * A/B Test Script: Compare LLM models for Living Heroes battle AI
 *
 * Usage:
 *   1. Make sure Ollama is running: ollama serve
 *   2. Pull both models: ollama pull qwen3:1.7b && ollama pull phi4-mini
 *   3. Run: npx tsx scripts/ab-test-models.ts
 *
 * Tests each model against realistic battle scenarios and compares:
 *   - Response time
 *   - JSON quality (correct intents, targets, positions)
 *   - Group order generation
 *   - Chat personality
 */

const OLLAMA_URL = 'http://localhost:11434';

const MODELS = [
  { name: 'alibayram/smollm3', label: 'SmolLM3 (current)' },
  { name: 'qwen3:1.7b', label: 'Qwen3 1.7B' },
  { name: 'phi4-mini', label: 'Phi-4-mini' },
];

// ── JSON Schema (same as game uses) ──

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    chatResponse: { type: 'string' },
    intent: {
      type: 'string',
      enum: ['hold_position', 'advance_to_point', 'protect_target', 'focus_enemy', 'retreat_to_point', 'use_skill'],
    },
    targetName: { type: 'string' },
    moveOption: { type: 'string' },
    priority: { type: 'string', enum: ['low', 'medium', 'high'] },
    groupOrders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          group: { type: 'string', enum: ['all', 'hero', 'warriors', 'archers'] },
          intent: {
            type: 'string',
            enum: ['hold_position', 'advance_to_point', 'protect_target', 'focus_enemy', 'retreat_to_point', 'use_skill'],
          },
          targetName: { type: 'string' },
          moveOption: { type: 'string' },
        },
        required: ['group', 'intent'],
      },
    },
  },
  required: ['chatResponse', 'intent'],
};

// ── System prompt (from heroPrompts.ts) ──

const SYSTEM_PROMPT = `You are Kael, a battlefield commander in a real-time strategy game.

PERSONALITY: aggressive and fearless. willing to take risks for tactical advantage. mission-focused — you accept ally losses if it wins the battle. decisive — you commit fully to your plans. tactically sharp — you use terrain and positioning well.

YOUR JOB:
1. You command your squad (warriors + archers) and fight as a frontline hero.
2. You receive a battlefield report with tactical positions (A-H) and enemy nicknames.
3. Pick an intent, a tactical position letter for moveOption, AND an enemy nickname for targetName.
4. ALWAYS set moveOption to a position letter (A-H). ALWAYS set targetName to an enemy or ally nickname.
5. When the report says "SPLIT ORDERS", you MUST include groupOrders with separate orders for each group.
6. When you want different groups to do different things, ALWAYS use groupOrders.
7. chatResponse: speak as Kael IN CHARACTER. Be fierce, tactical, and brief (1 sentence). Never say generic things like "Engaging" — describe YOUR plan.

INTENTS: hold_position, advance_to_point, protect_target, focus_enemy, retreat_to_point, use_skill
GROUPS: hero, warriors, archers

EXAMPLE RESPONSE:
{"chatResponse": "Warriors, crush that Brute! Archers, rain fire from the wall!", "intent": "focus_enemy", "targetName": "Enemy Brute", "moveOption": "B", "priority": "high", "groupOrders": [
  {"group": "warriors", "intent": "focus_enemy", "targetName": "Enemy Brute", "moveOption": "B"},
  {"group": "archers", "intent": "focus_enemy", "targetName": "Enemy Sniper", "moveOption": "A"},
  {"group": "hero", "intent": "advance_to_point", "moveOption": "E"}
]}`;

// ── Test scenarios ──

interface TestScenario {
  name: string;
  description: string;
  userPrompt: string;
  expectedBehavior: {
    shouldHaveGroupOrders: boolean;
    validIntents: string[];
    validTargets?: string[];
    validPositions?: string[];
  };
}

const SCENARIOS: TestScenario[] = [
  {
    name: '1. Basic attack command',
    description: 'Player gives a simple attack order',
    userPrompt: `BATTLE REPORT (45s, combat):
Live battle.
Hero: Kael HP:85/100 at center near pos-E

ALLIES (4):
  Allied Shield (warrior) HP:90% near pos-C idle
  Allied Guard (warrior) HP:75% near pos-C idle
  Allied Hawk (archer) HP:100% near pos-D idle
  Allied Arrow (archer) HP:95% near pos-D idle

ENEMIES (4):
  Enemy Brute (warrior) HP:100% near pos-B fighting
  Enemy Tank (warrior) HP:80% near pos-B fighting
  Enemy Sniper (archer) HP:70% near pos-F idle
  Enemy Hawk (archer) HP:90% near pos-F idle

TACTICAL POSITIONS (pick a letter for moveOption):
  A: Behind North Wall (370, 200) — full cover from east, good for archers
  B: East Flank (750, 350) — exposed, aggressive flanking angle
  C: Behind Center Wall (460, 290) — partial cover, controls center
  D: Behind Bottom Rocks (310, 550) — full cover, safe fallback
  E: Open Center (512, 384) — exposed, high ground control
  F: Southeast Corner (700, 500) — partial cover, ranged position

PLAYER SAYS: "attack the enemy warriors"
HINT: focus_enemy`,
    expectedBehavior: {
      shouldHaveGroupOrders: false,
      validIntents: ['focus_enemy', 'advance_to_point'],
      validTargets: ['Enemy Brute', 'Enemy Tank'],
      validPositions: ['A', 'B', 'C', 'D', 'E', 'F'],
    },
  },
  {
    name: '2. Split command (explicit)',
    description: 'Player gives explicit split orders for different groups',
    userPrompt: `BATTLE REPORT (60s, combat):
Live battle.
Hero: Kael HP:70/100 at center near pos-E

ALLIES (4):
  Allied Shield (warrior) HP:60% near pos-C fighting
  Allied Guard (warrior) HP:55% near pos-C fighting
  Allied Hawk (archer) HP:90% near pos-A idle
  Allied Arrow (archer) HP:85% near pos-A idle

ENEMIES (3):
  Enemy Brute (warrior) HP:50% near pos-B fighting
  Enemy Sniper (archer) HP:80% near pos-F idle
  Enemy Hawk (archer) HP:70% near pos-F idle

TACTICAL POSITIONS (pick a letter for moveOption):
  A: Behind North Wall (370, 200) — full cover from east, good for archers
  B: East Flank (750, 350) — exposed, aggressive flanking angle
  C: Behind Center Wall (460, 290) — partial cover, controls center
  D: Behind Bottom Rocks (310, 550) — full cover, safe fallback
  E: Open Center (512, 384) — exposed, high ground control
  F: Southeast Corner (700, 500) — partial cover, ranged position

PLAYER SAYS: "warriors push the brute, archers snipe from the north wall"
HINT: focus_enemy
SPLIT ORDERS — you MUST use groupOrders in your response:
  warriors: focus_enemy | target Enemy Brute | at pos-B
  archers: focus_enemy | target Enemy Sniper | at pos-A
Follow this assignment. Each group gets its own order in groupOrders.`,
    expectedBehavior: {
      shouldHaveGroupOrders: true,
      validIntents: ['focus_enemy', 'advance_to_point'],
      validTargets: ['Enemy Brute', 'Enemy Sniper', 'Enemy Hawk'],
      validPositions: ['A', 'B', 'C', 'D', 'E', 'F'],
    },
  },
  {
    name: '3. Abstract split command',
    description: 'Player says "each group target different enemy" — needs groupOrders',
    userPrompt: `BATTLE REPORT (30s, combat):
Live battle.
Hero: Kael HP:90/100 at center near pos-E

ALLIES (4):
  Allied Shield (warrior) HP:80% near pos-C idle
  Allied Guard (warrior) HP:85% near pos-C idle
  Allied Hawk (archer) HP:100% near pos-A idle
  Allied Arrow (archer) HP:95% near pos-A idle

ENEMIES (3):
  Enemy Brute (warrior) HP:100% near pos-B fighting
  Enemy Sniper (archer) HP:90% near pos-F idle
  Enemy Tank (warrior) HP:75% near pos-E fighting

TACTICAL POSITIONS (pick a letter for moveOption):
  A: Behind North Wall (370, 200) — full cover from east, good for archers
  B: East Flank (750, 350) — exposed, aggressive flanking angle
  C: Behind Center Wall (460, 290) — partial cover, controls center
  D: Behind Bottom Rocks (310, 550) — full cover, safe fallback
  E: Open Center (512, 384) — exposed, high ground control
  F: Southeast Corner (700, 500) — partial cover, ranged position

PLAYER SAYS: "each group target a different enemy"
HINT: focus_enemy
SPLIT ORDERS — you MUST use groupOrders in your response:
  warriors: focus_enemy | target Enemy Brute | at pos-B
  archers: focus_enemy | target Enemy Sniper | at pos-F
  hero: focus_enemy | target Enemy Tank | at pos-E
Follow this assignment. Each group gets its own order in groupOrders.`,
    expectedBehavior: {
      shouldHaveGroupOrders: true,
      validIntents: ['focus_enemy'],
      validTargets: ['Enemy Brute', 'Enemy Sniper', 'Enemy Tank'],
      validPositions: ['A', 'B', 'C', 'D', 'E', 'F'],
    },
  },
  {
    name: '4. Autonomous decision (no player input)',
    description: 'No player command — hero must decide independently',
    userPrompt: `BATTLE REPORT (90s, combat):
Live battle.
Hero: Kael HP:60/100 at center near pos-E

ALLIES (3):
  Allied Shield (warrior) HP:25% near pos-C fighting
  Allied Hawk (archer) HP:80% near pos-A idle
  Allied Arrow (archer) HP:70% near pos-D idle

ENEMIES (4):
  Enemy Brute (warrior) HP:90% near pos-B fighting
  Enemy Tank (warrior) HP:85% near pos-E fighting
  Enemy Sniper (archer) HP:60% near pos-F idle
  Enemy Hawk (archer) HP:50% near pos-F idle

TACTICAL POSITIONS (pick a letter for moveOption):
  A: Behind North Wall (370, 200) — full cover from east, good for archers
  B: East Flank (750, 350) — exposed, aggressive flanking angle
  C: Behind Center Wall (460, 290) — partial cover, controls center
  D: Behind Bottom Rocks (310, 550) — full cover, safe fallback
  E: Open Center (512, 384) — exposed, high ground control
  F: Southeast Corner (700, 500) — partial cover, ranged position

RECENT DAMAGE: Enemy Brute dealt 45 dmg to Allied Shield

NO NEW ORDERS. Allied Shield is at 25% HP and in danger. Protect or reposition?`,
    expectedBehavior: {
      shouldHaveGroupOrders: false,
      validIntents: ['protect_target', 'retreat_to_point', 'focus_enemy', 'hold_position', 'advance_to_point'],
      validTargets: ['Allied Shield', 'Enemy Brute', 'Enemy Tank', 'Enemy Sniper', 'Enemy Hawk'],
      validPositions: ['A', 'B', 'C', 'D', 'E', 'F'],
    },
  },
  {
    name: '5. Retreat under pressure',
    description: 'Hero is low HP, should consider retreat',
    userPrompt: `BATTLE REPORT (120s, combat):
Live battle.
Hero: Kael HP:20/100 at center near pos-E

ALLIES (2):
  Allied Hawk (archer) HP:40% near pos-D fighting
  Allied Arrow (archer) HP:30% near pos-D fighting

ENEMIES (3):
  Enemy Brute (warrior) HP:70% near pos-E fighting
  Enemy Tank (warrior) HP:60% near pos-C fighting
  Enemy Sniper (archer) HP:90% near pos-F idle

TACTICAL POSITIONS (pick a letter for moveOption):
  A: Behind North Wall (370, 200) — full cover from east, good for archers
  B: East Flank (750, 350) — exposed, aggressive flanking angle
  C: Behind Center Wall (460, 290) — partial cover, controls center
  D: Behind Bottom Rocks (310, 550) — full cover, safe fallback
  E: Open Center (512, 384) — exposed, high ground control
  F: Southeast Corner (700, 500) — partial cover, ranged position

RECENT DAMAGE: Enemy Brute dealt 30 dmg to Kael; Enemy Tank dealt 20 dmg to Allied Hawk

NO NEW ORDERS. You're outnumbered 3 to 2. What's your plan?`,
    expectedBehavior: {
      shouldHaveGroupOrders: false,
      validIntents: ['retreat_to_point', 'hold_position', 'focus_enemy', 'protect_target'],
      validPositions: ['A', 'B', 'C', 'D', 'E', 'F'],
    },
  },
];

// ── Test runner ──

interface TestResult {
  model: string;
  scenario: string;
  responseTimeMs: number;
  raw: any;
  parseable: boolean;
  hasValidIntent: boolean;
  hasValidTarget: boolean;
  hasValidPosition: boolean;
  hasGroupOrders: boolean;
  groupOrderCount: number;
  chatResponse: string;
  error?: string;
}

async function checkModelAvailable(model: string): Promise<boolean> {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await resp.json();
    return data.models?.some((m: any) => m.name === model || m.name.startsWith(model + ':'));
  } catch {
    return false;
  }
}

async function runSingleTest(model: string, scenario: TestScenario): Promise<TestResult> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: scenario.userPrompt },
  ];

  // Note: Qwen3 /no_think removed — it interferes with Ollama structured output

  const result: TestResult = {
    model,
    scenario: scenario.name,
    responseTimeMs: 0,
    raw: null,
    parseable: false,
    hasValidIntent: false,
    hasValidTarget: false,
    hasValidPosition: false,
    hasGroupOrders: false,
    groupOrderCount: 0,
    chatResponse: '',
  };

  try {
    const start = performance.now();
    const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        format: DECISION_SCHEMA,
        options: {
          num_predict: model.startsWith('qwen3') ? 4096 : 200,
          temperature: 0.7,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });
    result.responseTimeMs = Math.round(performance.now() - start);

    if (!resp.ok) {
      result.error = `HTTP ${resp.status}`;
      return result;
    }

    const data = await resp.json();
    const content = data.message?.content ?? '';
    const parsed = JSON.parse(content);
    result.raw = parsed;
    result.parseable = true;
    result.chatResponse = parsed.chatResponse ?? '';

    // Check intent
    const validIntents = ['hold_position', 'advance_to_point', 'protect_target', 'focus_enemy', 'retreat_to_point', 'use_skill'];
    result.hasValidIntent = validIntents.includes(parsed.intent);

    // Check target
    if (parsed.targetName && scenario.expectedBehavior.validTargets) {
      result.hasValidTarget = scenario.expectedBehavior.validTargets.some(
        (t) => parsed.targetName?.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(parsed.targetName?.toLowerCase())
      );
    } else {
      result.hasValidTarget = true; // no target expected
    }

    // Check position
    if (parsed.moveOption && scenario.expectedBehavior.validPositions) {
      result.hasValidPosition = scenario.expectedBehavior.validPositions.includes(parsed.moveOption.toUpperCase());
    } else {
      result.hasValidPosition = true; // no position expected
    }

    // Check group orders
    result.hasGroupOrders = Array.isArray(parsed.groupOrders) && parsed.groupOrders.length > 0;
    result.groupOrderCount = parsed.groupOrders?.length ?? 0;

  } catch (err: any) {
    result.error = err.message;
  }

  return result;
}

// ── Output formatting ──

function printResult(r: TestResult, expected: TestScenario['expectedBehavior']) {
  const pass = (b: boolean) => b ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const time = r.responseTimeMs < 2000 ? `\x1b[32m${r.responseTimeMs}ms\x1b[0m` : `\x1b[33m${r.responseTimeMs}ms\x1b[0m`;

  if (r.error) {
    console.log(`    \x1b[31mERROR: ${r.error}\x1b[0m`);
    return;
  }

  console.log(`    Time: ${time} | Intent: ${pass(r.hasValidIntent)} (${r.raw?.intent}) | Target: ${pass(r.hasValidTarget)} (${r.raw?.targetName ?? 'none'}) | Position: ${pass(r.hasValidPosition)} (${r.raw?.moveOption ?? 'none'})`);

  if (expected.shouldHaveGroupOrders) {
    console.log(`    GroupOrders: ${pass(r.hasGroupOrders)} (${r.groupOrderCount} orders)`);
    if (r.raw?.groupOrders) {
      for (const go of r.raw.groupOrders) {
        console.log(`      - ${go.group}: ${go.intent} → target:${go.targetName ?? '-'} pos:${go.moveOption ?? '-'}`);
      }
    }
  }

  console.log(`    Chat: "${r.chatResponse}"`);
}

// ── Main ──

async function main() {
  console.log('\n\x1b[1m=== Living Heroes: LLM A/B Test ===\x1b[0m\n');

  // Check which models are available
  const availableModels: typeof MODELS = [];
  for (const m of MODELS) {
    const available = await checkModelAvailable(m.name);
    if (available) {
      availableModels.push(m);
      console.log(`  \x1b[32m✓\x1b[0m ${m.label} (${m.name})`);
    } else {
      console.log(`  \x1b[31m✗\x1b[0m ${m.label} (${m.name}) — not pulled. Run: ollama pull ${m.name}`);
    }
  }

  if (availableModels.length === 0) {
    console.log('\n\x1b[31mNo models available! Pull at least one model first.\x1b[0m');
    process.exit(1);
  }

  console.log(`\nRunning ${SCENARIOS.length} scenarios × ${availableModels.length} models...\n`);

  const allResults: TestResult[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`\x1b[1m${scenario.name}\x1b[0m — ${scenario.description}`);

    for (const model of availableModels) {
      console.log(`  \x1b[36m${model.label}:\x1b[0m`);
      const result = await runSingleTest(model.name, scenario);
      allResults.push(result);
      printResult(result, scenario.expectedBehavior);
    }
    console.log();
  }

  // ── Summary ──
  console.log('\x1b[1m=== SUMMARY ===\x1b[0m\n');
  console.log('Model                | Avg Time | Valid Intent | Valid Target | Valid Pos | GroupOrders (when needed)');
  console.log('---------------------|----------|-------------|-------------|-----------|------------------------');

  for (const model of availableModels) {
    const results = allResults.filter((r) => r.model === model.name && !r.error);
    if (results.length === 0) {
      console.log(`${model.label.padEnd(21)}| ERROR    |             |             |           |`);
      continue;
    }

    const avgTime = Math.round(results.reduce((s, r) => s + r.responseTimeMs, 0) / results.length);
    const intentRate = Math.round((results.filter((r) => r.hasValidIntent).length / results.length) * 100);
    const targetRate = Math.round((results.filter((r) => r.hasValidTarget).length / results.length) * 100);
    const posRate = Math.round((results.filter((r) => r.hasValidPosition).length / results.length) * 100);

    // Group order rate — only count scenarios that expect them
    const groupScenarios = SCENARIOS.filter((s) => s.expectedBehavior.shouldHaveGroupOrders).map((s) => s.name);
    const groupResults = results.filter((r) => groupScenarios.includes(r.scenario));
    const groupRate = groupResults.length > 0
      ? Math.round((groupResults.filter((r) => r.hasGroupOrders).length / groupResults.length) * 100)
      : -1;

    const timeStr = avgTime < 2000 ? `\x1b[32m${avgTime}ms\x1b[0m` : `\x1b[33m${avgTime}ms\x1b[0m`;

    console.log(
      `${model.label.padEnd(21)}| ${String(avgTime + 'ms').padEnd(9)}| ${String(intentRate + '%').padEnd(12)}| ${String(targetRate + '%').padEnd(12)}| ${String(posRate + '%').padEnd(10)}| ${groupRate >= 0 ? groupRate + '%' : 'N/A'}`
    );
  }

  console.log('\n\x1b[2mTip: Run multiple times — small models have variance. Temperature is 0.7.\x1b[0m\n');
}

main().catch(console.error);
