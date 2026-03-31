import { ChainControl, ChainTriggerType, IntentType, UnitGroup } from '../types';
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

export interface LLMRawReservedChainStep extends LLMRawDecisionPlan {
  trigger: ChainTriggerType;
  chatResponse: string;
  summary: string;
}

export interface LLMRawOpeningPlan extends LLMRawDecisionPlan {
  chatResponse: string;
  planSummary: string;
  reservedSteps?: LLMRawReservedChainStep[];
}

/** Raw decision as the LLM produces it — needs resolution before becoming a HeroDecision */
export interface LLMRawDecision extends LLMRawDecisionPlan {
  chatResponse: string;
  playerOrderInterpretation?: LLMRawDecisionPlan;
  chainControl?: ChainControl;
}

export interface LLMResponse {
  chatResponse: string;
  raw: LLMRawDecision;
}

export interface LLMOpeningPlanResponse {
  raw: LLMRawOpeningPlan;
}

export interface LLMReservedStepResponse {
  reservedSteps: LLMRawReservedChainStep[];
}

export interface LLMRequestOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
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

const CHAIN_CONTROL_SCHEMA = {
  type: 'string',
  enum: ['keep', 'break'],
};

const RESERVED_CHAIN_STEP_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      chatResponse: { type: 'string', minLength: 1 },
      summary: { type: 'string', minLength: 1 },
      trigger: {
        type: 'string',
        enum: ['enemy_in_range', 'combat_started'],
      },
      ...DECISION_PLAN_PROPERTIES,
    },
    required: ['chatResponse', 'summary', 'trigger', 'intent'],
  },
};

/** JSON schema sent to Ollama structured outputs to guarantee valid response */
const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    chatResponse: { type: 'string', minLength: 1 },
    ...DECISION_PLAN_PROPERTIES,
    playerOrderInterpretation: OPTIONAL_PLAYER_ORDER_SCHEMA,
    chainControl: CHAIN_CONTROL_SCHEMA,
  },
  required: ['chatResponse', 'intent'],
};

const OPENING_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    chatResponse: { type: 'string', minLength: 1 },
    planSummary: { type: 'string', minLength: 1 },
    ...DECISION_PLAN_PROPERTIES,
    reservedSteps: RESERVED_CHAIN_STEP_SCHEMA,
  },
  required: ['chatResponse', 'planSummary', 'intent'],
};

const RESERVED_STEPS_ONLY_SCHEMA = {
  type: 'object',
  properties: {
    reservedSteps: RESERVED_CHAIN_STEP_SCHEMA,
  },
  required: ['reservedSteps'],
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
const VALID_CHAIN_CONTROLS: ChainControl[] = ['keep', 'break'];
const VALID_CHAIN_TRIGGERS: ChainTriggerType[] = ['enemy_in_range', 'combat_started'];

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
    options: LLMRequestOptions = {}
  ): Promise<LLMResponse> {
    const content = await this.sendStructuredChat(messages, DECISION_SCHEMA, options);
    return this.parseResponse(content);
  }

  async planOpeningStrategy(
    messages: ChatMessage[],
    options: LLMRequestOptions = {}
  ): Promise<LLMOpeningPlanResponse> {
    const content = await this.sendStructuredChat(messages, OPENING_PLAN_SCHEMA, options);
    return this.parseOpeningPlanResponse(content);
  }

  async planReservedSteps(
    messages: ChatMessage[],
    options: LLMRequestOptions = {}
  ): Promise<LLMReservedStepResponse> {
    const content = await this.sendStructuredChat(messages, RESERVED_STEPS_ONLY_SCHEMA, options);
    return this.parseReservedStepResponse(content);
  }

  private async sendStructuredChat(
    messages: ChatMessage[],
    schema: Record<string, unknown>,
    options: LLMRequestOptions = {}
  ): Promise<string> {
    const maxTokens = options.maxTokens ?? OLLAMA_CONFIG.maxTokens;
    const temperature = options.temperature ?? OLLAMA_CONFIG.temperature;
    const timeoutMs = options.timeoutMs ?? OLLAMA_CONFIG.timeoutMs;
    const body = {
      model: this.model,
      messages,
      stream: false,
      format: schema,
      options: {
        num_predict: maxTokens,
        temperature,
      },
    };

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
      throw new Error(`Ollama returned ${resp.status}`);
    }

    const data = await resp.json();
    return data.message?.content ?? '';
  }

  private parseResponse(content: string): LLMResponse {
    const raw = JSON.parse(content);
    const decision: LLMRawDecision = {
      chatResponse: raw.chatResponse ?? '',
      ...this.parseRequiredDecisionPlan(raw),
      playerOrderInterpretation: this.parseOptionalDecisionPlan(raw.playerOrderInterpretation),
      chainControl: VALID_CHAIN_CONTROLS.includes(raw.chainControl) ? raw.chainControl : undefined,
    };

    return {
      chatResponse: decision.chatResponse,
      raw: decision,
    };
  }

  private parseOpeningPlanResponse(content: string): LLMOpeningPlanResponse {
    const raw = JSON.parse(content);
    const openingPlan: LLMRawOpeningPlan = {
      chatResponse: raw.chatResponse ?? '',
      planSummary: typeof raw.planSummary === 'string' ? raw.planSummary : '',
      ...this.parseRequiredDecisionPlan(raw),
      reservedSteps: this.parseReservedSteps(raw.reservedSteps),
    };

    return {
      raw: openingPlan,
    };
  }

  private parseReservedStepResponse(content: string): LLMReservedStepResponse {
    const raw = JSON.parse(content);
    return {
      reservedSteps: this.parseReservedSteps(raw.reservedSteps) ?? [],
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
            if (!group || !goIntent) {
              return null;
            }

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

  private parseReservedSteps(rawReservedSteps: any): LLMRawReservedChainStep[] | undefined {
    const reservedSteps = Array.isArray(rawReservedSteps)
      ? rawReservedSteps
          .map((step: any): LLMRawReservedChainStep | null => {
            const trigger = VALID_CHAIN_TRIGGERS.includes(step?.trigger) ? step.trigger : null;
            const chatResponse = typeof step?.chatResponse === 'string' ? step.chatResponse.trim() : '';
            const summary = typeof step?.summary === 'string' ? step.summary.trim() : '';
            const plan = this.parseOptionalDecisionPlan(step);
            if (!trigger || !chatResponse || !summary || !plan) {
              return null;
            }

            return {
              ...plan,
              trigger,
              chatResponse,
              summary,
            };
          })
          .filter((step: LLMRawReservedChainStep | null): step is LLMRawReservedChainStep => step !== null)
          .slice(0, 2)
      : undefined;

    return reservedSteps && reservedSteps.length > 0 ? reservedSteps : undefined;
  }
}
