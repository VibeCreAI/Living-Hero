# Living Heros --- Prompt #3b: BitNet LLM Integration (Hero Brain System)

## CONTEXT

You are extending Living Heros after Prompt #3 (Hero Intelligence &
Personality System).

Current system includes:
- Deterministic battle loop (Movement, Targeting, Combat)
- Hero AI with personality-driven scoring (ScoredPersonalityBrain)
- HeroScheduler → HeroSummaryBuilder → HeroDecisionProvider → IntentExecutor pipeline
- Player command system (preset: Advance/Hold/Protect/Focus)
- React UI shell with BattleHUD

Your task is to integrate **BitNet b1.58-2B-4T** as the **primary hero
brain**, replacing the heuristic scoring system with a local LLM that:
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

Replace heuristic hero brain with **BitNet local LLM** while:
- Keeping the `IHeroDecisionProvider` interface unchanged
- Adding natural language player ↔ hero conversation
- Maintaining deterministic sub-unit behavior (code-only)
- Providing heuristic fallback when LLM is unavailable
- Keeping the game loop non-blocking (async LLM calls)

---

## CRITICAL RULES

### 1. TWO-TIER AI (MANDATORY)

- **Hero = LLM brain** (BitNet) — reasons, decides, converses
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

- If BitNet server is unavailable → use `LocalRuleBasedHeroBrain`
- If LLM response is malformed → use fallback decision
- If response exceeds timeout (3s) → use fallback

### 5. SCHEMA STABILITY

- `HeroSummary` and `HeroDecision` schemas remain stable
- Add optional `chatMessage` and `chatResponse` fields only

---

# BITNET OVERVIEW

## What Is BitNet?

BitNet b1.58-2B-4T is a **1.58-bit quantized LLM** from Microsoft:
- 2 billion parameters, trained on 4 trillion tokens
- Weights are ternary: {-1, 0, +1}
- Memory: **0.4 GB** (non-embedding)
- CPU decode latency: **~29ms/token**
- Context window: 4,096 tokens
- License: MIT

It runs entirely on CPU — no GPU required. Fast enough for real-time
game AI decisions (~1-2 seconds for a 50-token response).

## GitHub & Model

- Framework: https://github.com/microsoft/BitNet
- Model: https://huggingface.co/microsoft/bitnet-b1.58-2B-4T

## Inference Server

BitNet includes `run_inference_server.py` which wraps `llama-server`
(llama.cpp). This exposes an **OpenAI-compatible REST API**:

```
POST http://localhost:8080/v1/chat/completions
Content-Type: application/json

{
  "messages": [
    {"role": "system", "content": "...hero personality..."},
    {"role": "user", "content": "...battlefield context + player message..."}
  ],
  "max_tokens": 100,
  "temperature": 0.7
}
```

Response:
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "...hero response with decision JSON..."
    }
  }]
}
```

---

# IMPLEMENTATION STEPS

## STEP 1 --- BITNET SERVER SETUP

### Prerequisites

- Python >= 3.9
- CMake >= 3.22
- Clang >= 18 (Windows: Visual Studio 2022 with C++ tools)

### Installation

```bash
git clone https://github.com/microsoft/BitNet.git
cd BitNet
pip install -r requirements.txt

# Download model and build optimized kernels
python setup_env.py --hf-repo microsoft/bitnet-b1.58-2B-4T-gguf -q i2_s

# Start inference server
python run_inference_server.py \
  --model models/bitnet-b1.58-2B-4T-gguf/ggml-model-i2_s.gguf \
  --host 127.0.0.1 \
  --port 8080 \
  --threads 4 \
  --ctx-size 2048 \
  --n-predict 100 \
  --temperature 0.7
```

### Verification

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello, who are you?"}],
    "max_tokens": 50
  }'
```

Create a helper script `scripts/start-bitnet.sh` (and `.bat` for Windows)
to launch the server with game-optimized settings.

---

## STEP 2 --- BITNET CLIENT SERVICE

Create `src/game/ai/BitNetClient.ts`:

```ts
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface BitNetResponse {
  chatResponse: string;
  decision: HeroDecision | null;
}

class BitNetClient {
  private baseUrl: string;
  private available: boolean;

  constructor(baseUrl: string = 'http://localhost:8080');

  async healthCheck(): Promise<boolean>;

  async chat(
    messages: ChatMessage[],
    maxTokens?: number,
    temperature?: number
  ): Promise<BitNetResponse>;
}
```

Responsibilities:
- Send chat completion requests to BitNet server
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
3. You must ALWAYS respond with:
   a) A short conversational response (1-2 sentences, in character)
   b) A JSON decision block in this exact format:

\`\`\`decision
{
  "intent": "advance_to_point" | "hold_position" | "protect_target" | "focus_enemy" | "retreat_to_point",
  "targetId": "optional-unit-id",
  "moveTo": {"x": number, "y": number},
  "recheckInSec": 2
}
\`\`\`

4. Keep responses SHORT. You are in real-time combat.
5. Stay in character based on your personality traits.`;
}
```

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

## STEP 5 --- BITNET HERO BRAIN

Create `src/game/ai/BitNetHeroBrain.ts`:

Implements `IHeroDecisionProvider`:

```ts
class BitNetHeroBrain implements IHeroDecisionProvider {
  private client: BitNetClient;
  private conversationHistory: ChatMessage[];

  constructor(client: BitNetClient);

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
4. Send to BitNet server via `BitNetClient`
5. Parse response: extract `decision` JSON block + conversational text
6. Validate decision fields (clamp positions, verify targetIds)
7. Return decision + chat response
8. On failure: return fallback decision

### Response Parsing

The LLM response contains both conversational text and a JSON block:

```
I'll push the warriors forward to engage those archers. They won't last
long against our front line.

\```decision
{"intent":"focus_enemy","targetId":"unit-enemy-archer-0","recheckInSec":2}
\```
```

Parse by:
1. Extract text between ` ```decision ` and ` ``` ` markers
2. `JSON.parse()` the extracted block → `HeroDecision`
3. Everything outside the block → `chatResponse`
4. If no valid JSON block found → return null decision (fallback)

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

Create `src/app/react/components/hud/BitNetStatus.tsx`:

Small indicator showing BitNet server status:
- Green dot: "AI Online" (BitNet connected)
- Yellow dot: "AI Connecting..." (health check in progress)
- Red dot: "AI Offline (Fallback)" (using heuristic brain)

Shown in corner of battle UI. Health check runs every 10 seconds.

---

## STEP 10 --- CONFIGURATION

Create `src/game/ai/aiConfig.ts`:

```ts
export const AI_CONFIG = {
  bitnet: {
    baseUrl: 'http://localhost:8080',
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
- **Record** BitNet decisions in replay data (do NOT re-execute LLM)
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
- Show raw LLM prompt sent to BitNet
- Show raw LLM response received
- Show parsed `HeroDecision` JSON
- Show latency per LLM call
- Show fallback usage count
- Toggle to view full conversation history

---

## PROJECT STRUCTURE (NEW FILES)

```
src/game/ai/
  BitNetClient.ts          ← HTTP client for BitNet server
  BitNetHeroBrain.ts       ← IHeroDecisionProvider implementation using LLM
  heroPrompts.ts           ← System prompt builders per hero personality
  contextBuilder.ts        ← HeroSummary → LLM context prompt
  aiConfig.ts              ← Configuration constants

src/app/react/components/hud/
  ChatPanel.tsx            ← Player ↔ hero conversation UI
  BitNetStatus.tsx         ← Server connection indicator

scripts/
  start-bitnet.sh          ← Linux/Mac server launcher
  start-bitnet.bat         ← Windows server launcher
```

---

## WHAT NOT TO BUILD

- No fine-tuning or model training
- No cloud LLM fallback (local only)
- No multi-hero simultaneous LLM calls (one hero at a time for P0)
- No conversation memory across battles (future feature)
- No voice input/output
- No model switching UI

---

## IMPLEMENTATION PRIORITY

1. BitNet server setup + health check
2. BitNetClient (HTTP wrapper)
3. Hero system prompts + context builder
4. BitNetHeroBrain (IHeroDecisionProvider)
5. Async scheduler update
6. Chat panel UI
7. Connection status indicator
8. Battle scene wiring
9. Debug overlay
10. Configuration

---

## SUCCESS CRITERIA

- BitNet server runs locally and responds to game requests
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
