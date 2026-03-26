# Living Heros --- Prompt #3b: Ollama LLM Integration (Hero Brain System)

## CONTEXT

You are extending Living Heros after Prompt #3 (Hero Intelligence &
Personality System).

Current system includes:
- Deterministic battle loop (Movement, Targeting, Combat)
- Hero AI with personality-driven scoring (ScoredPersonalityBrain)
- HeroScheduler → HeroSummaryBuilder → HeroDecisionProvider → IntentExecutor pipeline
- Player command system (preset: Advance/Hold/Protect/Focus)
- React UI shell with BattleHUD
- **Tauri desktop wrapper** with Ollama sidecar (see prompt 00)

Your task is to integrate **Ollama** as the **primary hero brain**,
replacing the heuristic scoring system with a local LLM that:
- Receives natural language from the player
- Reasons about the battlefield using structured context
- Outputs tactical decisions AND conversational responses
- Controls sub-units through the existing IntentExecutor (code-only, deterministic)

---

## DOCUMENT PRIORITY (MANDATORY)

1. **TDD** → architecture and contracts (STRICT)
2. **PRD** → scope and vision
3. **GDD** → gameplay feel
4. This prompt → execution

If conflict exists → follow **TDD**.

---

## GOAL

Replace heuristic hero brain with **Ollama local LLM** while:
- Keeping the `IHeroDecisionProvider` interface unchanged
- Adding natural language player ↔ hero conversation
- Maintaining deterministic sub-unit behavior (code-only)
- Providing heuristic fallback when LLM is unavailable
- Keeping the game loop non-blocking (async LLM calls)

---

## CRITICAL RULES

### 1. TWO-TIER AI (MANDATORY)

- **Hero = LLM brain** (Ollama) — reasons, decides, converses
- **Sub-units = code-only** — deterministic, no LLM involvement
- LLM outputs `HeroDecision` → `IntentExecutor` applies to units via code

### 2. INTENT-ONLY OUTPUT

- LLM outputs structured `HeroDecision` JSON + conversational text
- LLM does NOT touch simulation, units, or game state directly
- `IntentExecutor` remains the only bridge between AI and simulation

### 3. NON-BLOCKING

- LLM inference is async (`fetch()` to local server)
- Game loop never waits for LLM response
- Hero uses last decision until new one arrives

### 4. FALLBACK REQUIRED

- If Ollama server is unavailable → use `LocalRuleBasedHeroBrain`
- If LLM response is malformed → use fallback decision
- If response exceeds timeout (3s) → use fallback

### 5. SCHEMA STABILITY

- `HeroSummary` and `HeroDecision` schemas remain stable
- Add optional `chatMessage` and `chatResponse` fields only

---

# OLLAMA OVERVIEW

## What Is Ollama?

Ollama is a **local LLM runtime** that wraps llama.cpp with:
- Simple CLI: `ollama pull`, `ollama serve`, `ollama run`
- OpenAI-compatible REST API built-in
- Model library with hundreds of models
- Easy model management (pull, cache, delete)
- Pre-built binaries for Windows, macOS, Linux
- GPU acceleration (CUDA, Metal) when available, CPU fallback

## Why Ollama Over BitNet?

- **Better model quality**: 3-4B models with 4-bit quantization produce
  significantly better structured JSON output and personality expression
  than BitNet's 2B ternary model
- **Model flexibility**: Players/devs can swap models based on hardware
- **Easier distribution**: Pre-built binaries, no compilation required
- **Bundleable**: Ollama binary can be shipped as a Tauri sidecar
- **Same API**: OpenAI-compatible, identical integration code

## Recommended Models

| Model | Params | Size | Speed (CPU) | Quality |
|-------|--------|------|-------------|---------|
| `smollm3` | 3B | ~2.0GB | ~45ms/tok | 95% JSON adherence, best structured output |
| `llama3.2:3b` | 3B | ~2.0GB | ~45ms/tok | Good conversation, solid all-rounder |
| `smollm3` | 3.8B | ~2.2GB | ~50ms/tok | Good for coding/structured tasks |
| `gemma2:2b` | 2.6B | ~1.6GB | ~35ms/tok | Fastest, for low-end hardware |

Default recommendation: `smollm3` (best structured JSON output reliability
at 3B scale — 95% schema adherence, outperforms Llama 3.2 3B and Qwen 2.5 3B
on reasoning benchmarks, 128K context support).

## API

Ollama exposes an OpenAI-compatible endpoint:

```
POST http://localhost:11434/api/chat
Content-Type: application/json

{
  "model": "smollm3",
  "messages": [
    {"role": "system", "content": "...hero personality..."},
    {"role": "user", "content": "...battlefield context + player message..."}
  ],
  "stream": false,
  "format": {
    "type": "object",
    "properties": {
      "chatResponse": { "type": "string" },
      "intent": { "type": "string", "enum": ["hold_position","advance_to_point","protect_target","focus_enemy","retreat_to_point","use_skill"] },
      "targetId": { "type": "string" },
      "moveTo": { "type": "object", "properties": { "x": {"type":"number"}, "y": {"type":"number"} } },
      "recheckInSec": { "type": "number" }
    },
    "required": ["chatResponse", "intent", "recheckInSec"]
  },
  "options": {
    "num_predict": 100,
    "temperature": 0.7
  }
}
```

> **Key feature**: Ollama v0.5+ supports **structured outputs** — passing a JSON
> schema in the `format` field constrains the model's output grammar to guarantee
> valid JSON matching the schema. No more parsing `\`\`\`decision` blocks from
> free-text responses.

Response:
```json
{
  "message": {
    "role": "assistant",
    "content": "{\"chatResponse\":\"Moving warriors to intercept!\",\"intent\":\"focus_enemy\",\"targetId\":\"unit-enemy-archer-0\",\"recheckInSec\":2}"
  }
}
```

---

# IMPLEMENTATION STEPS

## STEP 1 --- OLLAMA SETUP (DEV MODE)

### Prerequisites

- Ollama installed: https://ollama.com/download
- Pull a model: `ollama pull smollm3`
- Start server: `ollama serve` (runs on port 11434)

### Verification

```bash
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "smollm3",
    "messages": [{"role": "user", "content": "Hello, who are you?"}],
    "max_tokens": 50
  }'
```

Note: In production, Ollama is launched automatically by the Tauri
sidecar (see prompt 00). Developers run it manually during development.

---

## STEP 2 --- LLM CLIENT SERVICE

Create `src/game/ai/LLMClient.ts`:

```ts
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  chatResponse: string;
  decision: HeroDecision | null;
}

class LLMClient {
  private baseUrl: string;
  private model: string;
  private available: boolean;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'smollm3');

  async healthCheck(): Promise<boolean>;

  async chat(
    messages: ChatMessage[],
    maxTokens?: number,
    temperature?: number
  ): Promise<LLMResponse>;
}
```

Responsibilities:
- Send chat completion requests to Ollama server
- Parse response into `HeroDecision` JSON + conversational text
- Handle timeouts (3 second max)
- Track server availability
- Return `null` decision on failure (triggers fallback)

---

## STEP 3 --- HERO SYSTEM PROMPT

Create `src/game/ai/heroPrompts.ts`:

Each hero gets a **system prompt** that defines personality:

```ts
function buildHeroSystemPrompt(hero: HeroState): string {
  return `You are ${hero.name}, a battlefield commander in a strategy game.

PERSONALITY:
- Discipline: ${hero.traits.discipline}/1.0 (how closely you follow player orders)
- Boldness: ${hero.traits.boldness}/1.0 (aggression level)
- Caution: ${hero.traits.caution}/1.0 (risk avoidance)

RULES:
1. You command units in battle. You do NOT control them directly.
2. You receive battlefield reports and player messages.
3. Your response is structured JSON. Put your in-character reply in "chatResponse".
4. Choose an intent that matches your personality and the battlefield situation.
5. Keep chatResponse SHORT (1-2 sentences). You are in real-time combat.
6. Stay in character based on your personality traits.`;
}
```

> The JSON format is enforced by Ollama structured outputs — the system prompt
> only needs to guide the model on *what* to say, not *how* to format it.

---

## STEP 4 --- BATTLEFIELD CONTEXT PROMPT

Create `src/game/ai/contextBuilder.ts`:

Converts `HeroSummary` into a readable prompt for the LLM:

```ts
function buildContextPrompt(summary: HeroSummary, playerMessage?: string): string {
  let prompt = `BATTLEFIELD REPORT:
- Time: ${summary.timeSec.toFixed(1)}s
- Phase: ${summary.battlePhase}
- Your position: (${summary.heroState.position.x}, ${summary.heroState.position.y})

ALLIED UNITS (${summary.nearbyAllies.length} alive):
${summary.nearbyAllies.map(u =>
  `  - ${u.role} [${u.id}] HP:${u.hp}/${u.maxHp} at (${u.position.x},${u.position.y}) ${u.state}`
).join('\n')}

ENEMY UNITS (${summary.nearbyEnemies.length} alive):
${summary.nearbyEnemies.map(u =>
  `  - ${u.role} [${u.id}] HP:${u.hp}/${u.maxHp} at (${u.position.x},${u.position.y}) ${u.state}`
).join('\n')}

CURRENT ORDER: ${summary.currentCommand?.type ?? 'none'}`;

  if (playerMessage) {
    prompt += `\n\nPLAYER SAYS: "${playerMessage}"`;
  } else {
    prompt += `\n\nNo new orders. Reassess the situation and decide.`;
  }

  return prompt;
}
```

---

## STEP 5 --- OLLAMA HERO BRAIN

Create `src/game/ai/OllamaHeroBrain.ts`:

Implements `IHeroDecisionProvider`:

```ts
class OllamaHeroBrain implements IHeroDecisionProvider {
  private client: LLMClient;
  private conversationHistory: ChatMessage[];

  constructor(client: LLMClient);

  async decideAsync(
    summary: HeroSummary,
    playerMessage?: string
  ): Promise<{ decision: HeroDecision; chatResponse: string }>;

  // Sync fallback for interface compatibility
  decide(summary: HeroSummary): HeroDecision;
}
```

Flow:
1. Build system prompt from hero personality
2. Build context prompt from HeroSummary
3. Append player message (if any)
4. Send to Ollama server via `LLMClient` with `format` schema
5. `JSON.parse()` the response content (guaranteed valid by Ollama structured outputs)
6. Extract `chatResponse` string and decision fields
7. Validate decision fields (clamp positions, verify targetIds)
8. Return decision + chat response
9. On failure: return fallback decision

### Response Parsing (Structured Outputs)

Ollama v0.5+ structured outputs guarantee the response is valid JSON matching
the provided schema. No markdown block parsing needed:

```ts
const raw = JSON.parse(response.message.content);
// raw = { chatResponse: "Moving warriors!", intent: "focus_enemy", targetId: "...", recheckInSec: 2 }

const chatResponse = raw.chatResponse;
const decision: HeroDecision = {
  intent: raw.intent,
  targetId: raw.targetId,
  moveTo: raw.moveTo,
  recheckInSec: raw.recheckInSec,
  priority: "medium",
  rationaleTag: `llm_${raw.intent}`,
};
```

If `JSON.parse()` fails (should be rare with structured outputs) → return null decision (fallback).

---

## STEP 6 --- ASYNC SCHEDULER UPDATE

Modify `src/game/ai/HeroScheduler.ts`:

The scheduler must handle **async** LLM calls without blocking:

```ts
class HeroScheduler {
  private pendingDecision: boolean = false;

  update(dt, heroes, battleState, alliedUnits, enemyUnits): void {
    for (const hero of heroes) {
      if (this.pendingDecision) continue; // wait for response

      if (timeToRecheck) {
        this.pendingDecision = true;

        // Async: fire and forget, callback applies decision
        this.decisionProvider.decideAsync(summary, playerMessage)
          .then(result => {
            hero.setDecision(result.decision);
            this.intentExecutor.execute(hero, result.decision, allies, enemies);
            EventBus.emit('hero-chat-response', result.chatResponse);
            this.pendingDecision = false;
          })
          .catch(() => {
            // Fallback to heuristic
            const fallback = this.fallbackBrain.decide(summary);
            hero.setDecision(fallback);
            this.intentExecutor.execute(hero, fallback, allies, enemies);
            this.pendingDecision = false;
          });
      }
    }
  }
}
```

---

## STEP 7 --- CHAT UI (REACT)

Create `src/app/react/components/hud/ChatPanel.tsx`:

A chat panel where the player converses with their hero:

```
┌──────────────────────────────────┐
│ Commander                        │
├──────────────────────────────────┤
│ [Hero] Ready for battle.         │
│ [You]  Focus the archers!        │
│ [Hero] Moving warriors to engage │
│        archers. On it!           │
│ [You]  Pull back, we're losing   │
│ [Hero] Agreed. Retreating now.   │
├──────────────────────────────────┤
│ [Type message...]        [Send]  │
└──────────────────────────────────┘
```

Features:
- Scrollable message history
- Text input + Send button (or Enter key)
- Messages styled differently for player vs hero
- Preset command buttons still available alongside chat
- On send: `EventBus.emit('player-chat-message', text)`
- On response: `EventBus.on('hero-chat-response', text)`

---

## STEP 8 --- BATTLE SCENE WIRING

Modify `src/game/scenes/BattleScene.ts`:

- Listen for `player-chat-message` events from React chat panel
- Pass player message to `HeroScheduler` for next decision cycle
- Continue supporting keyboard preset commands (1-4)
- Preset commands also generate a chat message:
  - Key 1 → "Advance!" (shown in chat as player message)
  - Key 2 → "Hold position!"
  - Key 3 → "Protect the weak units!"
  - Key 4 → "Focus the nearest enemy!"

---

## STEP 9 --- CONNECTION STATUS UI

Create `src/app/react/components/hud/LLMStatus.tsx`:

Small indicator showing Ollama server status:
- Green dot: "AI Online" (Ollama connected, model loaded)
- Yellow dot: "AI Connecting..." (health check in progress)
- Red dot: "AI Offline (Fallback)" (using heuristic brain)

Shown in corner of battle UI. Health check runs every 10 seconds.

---

## STEP 10 --- CONFIGURATION

Create `src/game/ai/aiConfig.ts`:

```ts
export const AI_CONFIG = {
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'smollm3',  // best structured JSON at 3B scale
    maxTokens: 100,
    temperature: 0.7,
    timeoutMs: 3000,
    healthCheckIntervalMs: 10000,
  },
  scheduler: {
    defaultRecheckSec: 2,
    minRecheckSec: 1,
    maxRecheckSec: 5,
  },
  fallback: {
    enabled: true, // always keep heuristic fallback
  },
};
```

---

## STEP 11 --- DETERMINISM & REPLAY COMPATIBILITY

For replay system (Prompt #8):
- **Record** LLM decisions in replay data (do NOT re-execute LLM)
- Each `HeroDecision` is timestamped and stored in `ReplayEvent[]`
- On replay playback: inject recorded decisions at correct timestamps
- This ensures identical replay even though LLM output is non-deterministic

```ts
type ReplayEvent =
  | { type: "command"; time: number; command: PlayerCommand }
  | { type: "decision"; time: number; heroId: string; decision: HeroDecision }
  | { type: "chat"; time: number; heroId: string; playerMessage: string; heroResponse: string }
```

---

## STEP 12 --- DEBUG OVERLAY

Extend debug UI:
- Show raw LLM prompt sent to Ollama
- Show raw LLM response received
- Show parsed `HeroDecision` JSON
- Show latency per LLM call
- Show fallback usage count
- Show current model name
- Toggle to view full conversation history

---

## PROJECT STRUCTURE (NEW FILES)

```
src/game/ai/
  LLMClient.ts              ← HTTP client for Ollama server
  OllamaHeroBrain.ts        ← IHeroDecisionProvider implementation using LLM
  heroPrompts.ts            ← System prompt builders per hero personality
  contextBuilder.ts         ← HeroSummary → LLM context prompt
  aiConfig.ts               ← Configuration constants

src/app/react/components/hud/
  ChatPanel.tsx             ← Player ↔ hero conversation UI
  LLMStatus.tsx             ← Server connection indicator
```

---

## WHAT NOT TO BUILD

- No fine-tuning or model training
- No cloud LLM fallback (local only)
- No multi-hero simultaneous LLM calls (one hero at a time for P0)
- No conversation memory across battles (future feature)
- No voice input/output
- No model switching UI (model configured in aiConfig.ts)

---

## IMPLEMENTATION PRIORITY

1. Ollama dev setup + health check
2. LLMClient (HTTP wrapper)
3. Hero system prompts + context builder
4. OllamaHeroBrain (IHeroDecisionProvider)
5. Async scheduler update
6. Chat panel UI
7. Connection status indicator
8. Battle scene wiring
9. Debug overlay
10. Configuration

---

## SUCCESS CRITERIA

- Ollama server runs locally and responds to game requests
- Hero makes LLM-driven decisions that feel personality-consistent
- Player can type natural language and hero responds in character
- Sub-units follow hero decisions via code (deterministic)
- Game runs smoothly even during LLM inference (non-blocking)
- Fallback to heuristic brain works when server is down
- Chat panel shows readable player ↔ hero conversation
- Architecture remains clean and modular

---

## FINAL INSTRUCTION

Build a **local LLM-powered hero brain** that makes Living Heros unique:
players don't just issue commands — they **talk to** intelligent AI
commanders who reason, explain, and fight alongside them.

The hero is the star. The LLM makes them feel **alive**.

Keep it simple, keep it local, keep it fast.
