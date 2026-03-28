import { GroupOrder, HeroDecision, IntentType, UnitGroup } from '../types';
import { OLLAMA_CONFIG } from './config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  chatResponse: string;
  decision: HeroDecision | null;
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
    targetId: { type: 'string' },
    moveTo: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
      },
    },
    recheckInSec: { type: 'number' },
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
          targetId: { type: 'string' },
          moveTo: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
        },
        required: ['group', 'intent'],
      },
    },
  },
  required: ['chatResponse', 'intent', 'recheckInSec'],
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

    const intent = VALID_INTENTS.includes(raw.intent) ? raw.intent : 'hold_position';
    const groupOrders: GroupOrder[] | undefined = Array.isArray(raw.groupOrders)
      ? raw.groupOrders
          .map((groupOrder: any): GroupOrder | null => {
            const group = VALID_GROUPS.includes(groupOrder?.group) ? groupOrder.group : null;
            const groupIntent = VALID_INTENTS.includes(groupOrder?.intent)
              ? groupOrder.intent
              : null;

            if (!group || !groupIntent) {
              return null;
            }

            return {
              group,
              intent: groupIntent,
              targetId: typeof groupOrder.targetId === 'string' ? groupOrder.targetId : undefined,
              moveTo:
                typeof groupOrder.moveTo?.x === 'number' && typeof groupOrder.moveTo?.y === 'number'
                  ? { x: groupOrder.moveTo.x, y: groupOrder.moveTo.y }
                  : undefined,
            };
          })
          .filter((groupOrder: GroupOrder | null): groupOrder is GroupOrder => groupOrder !== null)
      : undefined;

    const decision: HeroDecision = {
      intent,
      targetId: raw.targetId,
      moveTo: raw.moveTo,
      skillId: undefined,
      groupOrders: groupOrders && groupOrders.length > 0 ? groupOrders : undefined,
      priority: raw.priority ?? 'medium',
      rationaleTag:
        groupOrders && groupOrders.length > 0 ? 'llm_group_orders' : `llm_${intent}`,
      recheckInSec: typeof raw.recheckInSec === 'number' ? raw.recheckInSec : 2,
    };

    return {
      chatResponse: raw.chatResponse ?? '',
      decision,
    };
  }
}
