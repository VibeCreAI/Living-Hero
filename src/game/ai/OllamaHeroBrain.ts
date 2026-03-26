import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { HeroSummary, HeroDecision, UnitState, GroupOrder } from '../types';
import { LLMClient, ChatMessage } from './LLMClient';
import { buildHeroSystemPrompt } from './heroPrompts';
import { buildContextPrompt } from './contextBuilder';
import { LocalRuleBasedHeroBrain } from './LocalRuleBasedHeroBrain';
import { OLLAMA_CONFIG } from './config';
import { interpretPlayerMessage } from './PlayerMessageInterpreter';

export interface OllamaDecisionResult {
  decision: HeroDecision;
  chatResponse: string;
}

const FALLBACK_DECISION: HeroDecision = {
  intent: 'hold_position',
  priority: 'low',
  rationaleTag: 'fallback_safe',
  recheckInSec: 2,
};

/**
 * LLM-powered hero brain using Ollama with structured outputs.
 * Implements IHeroDecisionProvider for sync compatibility.
 * Use decideAsync() for the full LLM experience with chat responses.
 */
export class OllamaHeroBrain implements IHeroDecisionProvider {
  private client: LLMClient;
  private fallback: LocalRuleBasedHeroBrain;
  private conversationHistory: ChatMessage[] = [];
  private lastDecision: HeroDecision = FALLBACK_DECISION;
  private pending = false;

  /** Debug info from the last LLM call */
  lastLatencyMs = 0;
  fallbackCount = 0;
  llmCallCount = 0;

  constructor(
    client?: LLMClient,
    baseUrl: string = OLLAMA_CONFIG.baseUrl,
    model: string = OLLAMA_CONFIG.model
  ) {
    this.client = client ?? new LLMClient(baseUrl, model);
    this.fallback = new LocalRuleBasedHeroBrain();
  }

  /** Sync decide — returns cached decision or fallback. Used by IHeroDecisionProvider. */
  decide(summary: HeroSummary): HeroDecision {
    return this.fallback.decide(summary);
  }

  /**
   * Async decide — sends to Ollama, returns decision + chat response.
   * Called by the scheduler; non-blocking to the game loop.
   */
  async decideAsync(
    summary: HeroSummary,
    playerMessage?: string,
    terrainDescription?: string
  ): Promise<OllamaDecisionResult> {
    if (this.pending) {
      return { decision: this.lastDecision, chatResponse: '' };
    }

    this.pending = true;

    try {
      const isHealthy = this.client.isAvailable() || (await this.client.healthCheck());
      if (!isHealthy) {
        throw new Error('Ollama unavailable');
      }

      const systemPrompt = buildHeroSystemPrompt(summary.heroState);
      const contextPrompt = buildContextPrompt(summary, playerMessage, terrainDescription);

      // Build message list: system + recent conversation + new context
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory.slice(-4), // keep last 2 exchanges
        { role: 'user', content: contextPrompt },
      ];

      const start = performance.now();
      const response = await this.client.chat(messages);
      this.lastLatencyMs = performance.now() - start;
      this.llmCallCount++;

      if (response.decision) {
        const normalizedDecision = this.normalizeDecision(
          response.decision,
          summary,
          playerMessage,
          terrainDescription,
          response.chatResponse
        );
        this.lastDecision = normalizedDecision;

        // Store in conversation history
        this.conversationHistory.push(
          { role: 'user', content: contextPrompt },
          { role: 'assistant', content: response.chatResponse }
        );

        // Cap history length
        if (this.conversationHistory.length > 10) {
          this.conversationHistory = this.conversationHistory.slice(-6);
        }

        return { decision: normalizedDecision, chatResponse: response.chatResponse };
      }

      throw new Error('No valid decision from LLM');
    } catch {
      this.fallbackCount++;
      const fallbackDecision = this.fallback.decide(summary);
      this.lastDecision = fallbackDecision;
      return { decision: fallbackDecision, chatResponse: '' };
    } finally {
      this.pending = false;
    }
  }

  /** Start periodic health checks */
  startHealthChecks(): () => void {
    const interval = setInterval(() => {
      this.client.healthCheck();
    }, OLLAMA_CONFIG.healthCheckIntervalMs);

    return () => clearInterval(interval);
  }

  /** Reset conversation history (e.g., between battles) */
  resetConversation(): void {
    this.conversationHistory = [];
    this.lastDecision = FALLBACK_DECISION;
    this.lastLatencyMs = 0;
    this.fallbackCount = 0;
    this.llmCallCount = 0;
  }

  private normalizeDecision(
    decision: HeroDecision,
    summary: HeroSummary,
    playerMessage?: string,
    terrainDescription?: string,
    chatResponse?: string
  ): HeroDecision {
    const parsedDirective = playerMessage
      ? interpretPlayerMessage(summary, playerMessage, terrainDescription)
      : null;
    const parsedChatPlan = chatResponse
      ? interpretPlayerMessage(summary, chatResponse, terrainDescription)
      : null;

    const normalized: HeroDecision = {
      ...decision,
      moveTo: decision.moveTo ? { ...decision.moveTo } : undefined,
      groupOrders: decision.groupOrders?.map((groupOrder) => ({
        ...groupOrder,
        moveTo: groupOrder.moveTo ? { ...groupOrder.moveTo } : undefined,
      })),
    };

    const allUnits = [...summary.nearbyAllies, ...summary.nearbyEnemies];
    const validTarget = normalized.targetId
      ? allUnits.find((unit) => unit.id === normalized.targetId)
      : undefined;
    const namedEnemy = playerMessage
      ? this.resolveNamedEnemy(summary.nearbyEnemies, playerMessage)
      : undefined;

    if (!validTarget && namedEnemy) {
      normalized.targetId = namedEnemy.id;
    } else if (!validTarget && normalized.targetId) {
      normalized.targetId = undefined;
    }

    if (!normalized.moveTo && namedEnemy && normalized.intent === 'focus_enemy') {
      normalized.moveTo = { ...namedEnemy.position };
    }

    if (parsedDirective && normalized.intent === parsedDirective.intent) {
      normalized.targetId ??= parsedDirective.targetId;
      normalized.moveTo ??= parsedDirective.moveTo ? { ...parsedDirective.moveTo } : undefined;
    }

    normalized.groupOrders = this.mergeDirectiveGroupOrders(
      normalized.groupOrders,
      parsedChatPlan?.groupOrders
    );
    normalized.groupOrders = this.mergeDirectiveGroupOrders(
      normalized.groupOrders,
      parsedDirective?.groupOrders
    );

    if (normalized.groupOrders?.length) {
      normalized.groupOrders = normalized.groupOrders
        .map((groupOrder) => this.normalizeGroupOrder(groupOrder, allUnits, namedEnemy))
        .filter((groupOrder): groupOrder is GroupOrder => groupOrder !== null);

      if (normalized.groupOrders.length === 0) {
        normalized.groupOrders = undefined;
      } else if (!normalized.rationaleTag.includes('group_orders')) {
        normalized.rationaleTag = parsedChatPlan?.groupOrders?.length
          ? 'llm_chat_group_orders'
          : 'llm_group_orders_scaffolded';
      } else if (
        parsedChatPlan?.groupOrders?.length &&
        normalized.rationaleTag === 'llm_group_orders'
      ) {
        normalized.rationaleTag = 'llm_group_orders_scaffolded';
      }
    }

    return normalized;
  }

  private normalizeGroupOrder(
    groupOrder: GroupOrder,
    allUnits: UnitState[],
    namedEnemy?: UnitState
  ): GroupOrder | null {
    const validTarget = groupOrder.targetId
      ? allUnits.find((unit) => unit.id === groupOrder.targetId)
      : undefined;
    const targetId = validTarget
      ? validTarget.id
      : groupOrder.intent === 'focus_enemy' && namedEnemy
        ? namedEnemy.id
        : undefined;
    const fallbackMoveTo =
      groupOrder.intent === 'focus_enemy' && targetId === namedEnemy?.id && namedEnemy
        ? { ...namedEnemy.position }
        : undefined;

    return {
      ...groupOrder,
      targetId,
      moveTo: groupOrder.moveTo ? { ...groupOrder.moveTo } : fallbackMoveTo,
    };
  }

  private mergeDirectiveGroupOrders(
    llmOrders: GroupOrder[] | undefined,
    parsedOrders: GroupOrder[] | undefined
  ): GroupOrder[] | undefined {
    if (!parsedOrders?.length) {
      return llmOrders;
    }

    if (!llmOrders?.length) {
      return parsedOrders.map((groupOrder) => ({
        ...groupOrder,
        moveTo: groupOrder.moveTo ? { ...groupOrder.moveTo } : undefined,
      }));
    }

    const merged = new Map<GroupOrder['group'], GroupOrder>();
    for (const groupOrder of llmOrders) {
      merged.set(groupOrder.group, {
        ...groupOrder,
        moveTo: groupOrder.moveTo ? { ...groupOrder.moveTo } : undefined,
      });
    }

    for (const parsedOrder of parsedOrders) {
      const existing = merged.get(parsedOrder.group);
      if (!existing) {
        merged.set(parsedOrder.group, {
          ...parsedOrder,
          moveTo: parsedOrder.moveTo ? { ...parsedOrder.moveTo } : undefined,
        });
        continue;
      }

      if (existing.intent !== parsedOrder.intent) {
        continue;
      }

      merged.set(parsedOrder.group, {
        ...existing,
        targetId: existing.targetId ?? parsedOrder.targetId,
        moveTo: existing.moveTo
          ? { ...existing.moveTo }
          : parsedOrder.moveTo
            ? { ...parsedOrder.moveTo }
            : undefined,
      });
    }

    return [...merged.values()];
  }

  private resolveNamedEnemy(enemies: UnitState[], playerMessage: string): UnitState | undefined {
    const message = playerMessage.toLowerCase();
    let bestMatch: UnitState | undefined;
    let bestLength = -1;

    for (const enemy of enemies) {
      const names = [enemy.displayName, enemy.id]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());

      for (const name of names) {
        if (message.includes(name) && name.length > bestLength) {
          bestLength = name.length;
          bestMatch = enemy;
        }
      }
    }

    return bestMatch;
  }
}
