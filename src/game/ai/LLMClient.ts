import { IntentType, UnitGroup } from '../types';
import { OLLAMA_CONFIG } from './config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Raw group order as the LLM produces it (nicknames + letters, not real IDs/coords) */
export interface LLMGroupOrder {
  group: UnitGroup;
  intent: IntentType;
  targetName?: string;
  moveOption?: string;
}

/** Raw decision as the LLM produces it — needs resolution before becoming a HeroDecision */
export interface LLMRawDecision {
  chatResponse: string;
  intent: IntentType;
  targetName?: string;
  moveOption?: string;
  priority: 'low' | 'medium' | 'high';
  groupOrders?: LLMGroupOrder[];
}

export interface LLMResponse {
  chatResponse: string;
  raw: LLMRawDecision;
}

/** JSON schema sent to Ollama structured outputs to guarantee valid response */
const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    chatResponse: { type: 'string' },
    intent: {
      type: 'string',
      enum: [
        'hold_position',
        'advance_to_point',
        'protect_target',
        'focus_enemy',
        'retreat_to_point',
        'use_skill',
      ],
    },
    targetName: { type: 'string' },
    moveOption: { type: 'string' },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    groupOrders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          group: {
            type: 'string',
            enum: ['all', 'hero', 'warriors', 'archers'],
          },
          intent: {
            type: 'string',
            enum: [
              'hold_position',
              'advance_to_point',
              'protect_target',
              'focus_enemy',
              'retreat_to_point',
              'use_skill',
            ],
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

const VALID_INTENTS: IntentType[] = [
  'hold_position',
  'advance_to_point',
  'protect_target',
  'focus_enemy',
  'retreat_to_point',
  'use_skill',
];

const VALID_GROUPS: UnitGroup[] = ['all', 'hero', 'warriors', 'archers'];

export class LLMClient {
  private baseUrl: string;
  private model: string;
  private available = false;

  constructor(
    baseUrl: string = OLLAMA_CONFIG.baseUrl,
    model: string = OLLAMA_CONFIG.model
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      this.available = resp.ok;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async chat(
    messages: ChatMessage[],
    maxTokens: number = OLLAMA_CONFIG.maxTokens,
    temperature: number = OLLAMA_CONFIG.temperature
  ): Promise<LLMResponse> {
    const body = {
      model: this.model,
      messages,
      stream: false,
      format: DECISION_SCHEMA,
      options: {
        num_predict: maxTokens,
        temperature,
      },
    };

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OLLAMA_CONFIG.timeoutMs),
    });

    if (!resp.ok) {
      throw new Error(`Ollama returned ${resp.status}`);
    }

    const data = await resp.json();
    const content: string = data.message?.content ?? '';

    return this.parseResponse(content);
  }

  private parseResponse(content: string): LLMResponse {
    const raw = JSON.parse(content);

    const intent: IntentType = VALID_INTENTS.includes(raw.intent)
      ? raw.intent
      : 'hold_position';

    const groupOrders: LLMGroupOrder[] | undefined = Array.isArray(raw.groupOrders)
      ? raw.groupOrders
          .map((go: any): LLMGroupOrder | null => {
            const group = VALID_GROUPS.includes(go?.group) ? go.group : null;
            const goIntent = VALID_INTENTS.includes(go?.intent) ? go.intent : null;
            if (!group || !goIntent) return null;
            return {
              group,
              intent: goIntent,
              targetName: typeof go.targetName === 'string' ? go.targetName : undefined,
              moveOption: typeof go.moveOption === 'string' ? go.moveOption : undefined,
            };
          })
          .filter((go: LLMGroupOrder | null): go is LLMGroupOrder => go !== null)
      : undefined;

    const decision: LLMRawDecision = {
      chatResponse: raw.chatResponse ?? '',
      intent,
      targetName: typeof raw.targetName === 'string' ? raw.targetName : undefined,
      moveOption: typeof raw.moveOption === 'string' ? raw.moveOption : undefined,
      priority: ['low', 'medium', 'high'].includes(raw.priority) ? raw.priority : 'medium',
      groupOrders: groupOrders && groupOrders.length > 0 ? groupOrders : undefined,
    };

    return {
      chatResponse: decision.chatResponse,
      raw: decision,
    };
  }
}
