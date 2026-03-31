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

export interface LLMRawDecisionPlan {
  intent: IntentType;
  targetName?: string;
  moveOption?: string;
  priority: 'low' | 'medium' | 'high';
  groupOrders?: LLMGroupOrder[];
}

/** Raw decision as the LLM produces it — needs resolution before becoming a HeroDecision */
export interface LLMRawDecision extends LLMRawDecisionPlan {
  chatResponse: string;
  playerOrderInterpretation?: LLMRawDecisionPlan;
}

export interface LLMResponse {
  chatResponse: string;
  raw: LLMRawDecision;
}

const GROUP_ORDER_SCHEMA = {
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
};

const DECISION_PLAN_PROPERTIES = {
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
  groupOrders: GROUP_ORDER_SCHEMA,
};

const OPTIONAL_PLAYER_ORDER_SCHEMA = {
  type: 'object',
  properties: DECISION_PLAN_PROPERTIES,
  required: ['intent'],
};

/** JSON schema sent to Ollama structured outputs to guarantee valid response */
const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    chatResponse: { type: 'string' },
    ...DECISION_PLAN_PROPERTIES,
    playerOrderInterpretation: OPTIONAL_PLAYER_ORDER_SCHEMA,
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
    const decision: LLMRawDecision = {
      chatResponse: raw.chatResponse ?? '',
      ...this.parseRequiredDecisionPlan(raw),
      playerOrderInterpretation: this.parseOptionalDecisionPlan(raw.playerOrderInterpretation),
    };

    return {
      chatResponse: decision.chatResponse,
      raw: decision,
    };
  }

  private parseRequiredDecisionPlan(raw: any): LLMRawDecisionPlan {
    return {
      intent: VALID_INTENTS.includes(raw.intent) ? raw.intent : 'hold_position',
      targetName: typeof raw.targetName === 'string' ? raw.targetName : undefined,
      moveOption: typeof raw.moveOption === 'string' ? raw.moveOption : undefined,
      priority: ['low', 'medium', 'high'].includes(raw.priority) ? raw.priority : 'medium',
      groupOrders: this.parseGroupOrders(raw.groupOrders),
    };
  }

  private parseOptionalDecisionPlan(raw: any): LLMRawDecisionPlan | undefined {
    if (!raw || typeof raw !== 'object' || !VALID_INTENTS.includes(raw.intent)) {
      return undefined;
    }

    return {
      intent: raw.intent,
      targetName: typeof raw.targetName === 'string' ? raw.targetName : undefined,
      moveOption: typeof raw.moveOption === 'string' ? raw.moveOption : undefined,
      priority: ['low', 'medium', 'high'].includes(raw.priority) ? raw.priority : 'medium',
      groupOrders: this.parseGroupOrders(raw.groupOrders),
    };
  }

  private parseGroupOrders(rawGroupOrders: any): LLMGroupOrder[] | undefined {
    const groupOrders: LLMGroupOrder[] | undefined = Array.isArray(rawGroupOrders)
      ? rawGroupOrders
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

    return groupOrders && groupOrders.length > 0 ? groupOrders : undefined;
  }
}
