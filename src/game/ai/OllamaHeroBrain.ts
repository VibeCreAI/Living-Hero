import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { HeroSummary, HeroDecision, GroupOrder } from '../types';
import { LLMClient, ChatMessage, LLMRawDecision, LLMGroupOrder } from './LLMClient';
import { buildHeroSystemPrompt } from './heroPrompts';
import { buildContextPrompt } from './contextBuilder';
import { LocalRuleBasedHeroBrain } from './LocalRuleBasedHeroBrain';
import { OLLAMA_CONFIG, AI_CONFIG } from './config';
import { BattleVocabulary } from './BattleVocabulary';
import {
  TacticalPositionMenuResult,
  buildTacticalPositionMenu,
  resolveMoveOption,
} from './TacticalPositionMenu';

export interface OllamaDecisionResult {
  decision: HeroDecision;
  chatResponse: string;
  positionMenu: TacticalPositionMenuResult;
  vocabulary: BattleVocabulary;
}

const FALLBACK_DECISION: HeroDecision = {
  intent: 'hold_position',
  priority: 'low',
  rationaleTag: 'fallback_safe',
  recheckInSec: 2,
};

/**
 * LLM-powered hero brain using Ollama with structured outputs.
 * Now stateless per call (no conversation history).
 * Returns raw LLM decisions resolved to real IDs + coordinates.
 */
export class OllamaHeroBrain implements IHeroDecisionProvider {
  private client: LLMClient;
  private fallback: LocalRuleBasedHeroBrain;
  private pending = false;

  /** Shared vocabulary — set by the scheduler at battle start */
  vocabulary: BattleVocabulary = new BattleVocabulary();

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

  /** Sync decide — returns fallback decision. Used by IHeroDecisionProvider. */
  decide(summary: HeroSummary): HeroDecision {
    return this.fallback.decide(summary);
  }

  /**
   * Async decide — sends to Ollama, returns resolved decision + chat response.
   * Each call is stateless (no conversation history).
   */
  async decideAsync(
    summary: HeroSummary,
    playerMessage?: string,
    terrainDescription?: string
  ): Promise<OllamaDecisionResult> {
    if (this.pending) {
      return {
        decision: FALLBACK_DECISION,
        chatResponse: '',
        positionMenu: buildTacticalPositionMenu(summary),
        vocabulary: this.vocabulary,
      };
    }

    this.pending = true;

    try {
      const isHealthy = this.client.isAvailable() || (await this.client.healthCheck());
      if (!isHealthy) {
        throw new Error('Ollama unavailable');
      }

      // Build position menu for this decision cycle
      const positionMenu = buildTacticalPositionMenu(summary);

      // Build prompts
      const systemPrompt = buildHeroSystemPrompt(summary.heroState);
      const contextPrompt = buildContextPrompt(
        summary,
        positionMenu,
        this.vocabulary,
        playerMessage,
        terrainDescription
      );

      // Stateless: system + single user message (no history)
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextPrompt },
      ];

      const start = performance.now();
      const response = await this.client.chat(messages);
      this.lastLatencyMs = performance.now() - start;
      this.llmCallCount++;

      // Resolve the raw LLM output to a real HeroDecision
      const decision = this.resolveRawDecision(
        response.raw,
        summary,
        positionMenu
      );

      return {
        decision,
        chatResponse: response.chatResponse,
        positionMenu,
        vocabulary: this.vocabulary,
      };
    } catch {
      this.fallbackCount++;
      const fallbackDecision = this.fallback.decide(summary);
      return {
        decision: fallbackDecision,
        chatResponse: '',
        positionMenu: buildTacticalPositionMenu(summary),
        vocabulary: this.vocabulary,
      };
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

  /** Reset stats between battles */
  resetConversation(): void {
    this.lastLatencyMs = 0;
    this.fallbackCount = 0;
    this.llmCallCount = 0;
  }

  /**
   * Resolve raw LLM output (nicknames + letters) into a real HeroDecision (IDs + coordinates).
   */
  private resolveRawDecision(
    raw: LLMRawDecision,
    summary: HeroSummary,
    positionMenu: TacticalPositionMenuResult
  ): HeroDecision {
    const heroPos = summary.heroState.position;

    // Resolve targetName → targetId
    const targetId = raw.targetName
      ? this.vocabulary.resolveNickname(raw.targetName)
      : undefined;

    // Resolve moveOption → moveTo coordinates
    const moveTo = raw.moveOption
      ? resolveMoveOption(positionMenu, raw.moveOption, heroPos)
      : undefined;

    // If focus_enemy with a target but no moveTo, point at the target's position
    const resolvedMoveTo =
      !moveTo && targetId && raw.intent === 'focus_enemy'
        ? this.findUnitPosition(targetId, summary)
        : moveTo;

    // Resolve group orders
    const groupOrders = raw.groupOrders
      ? this.resolveGroupOrders(raw.groupOrders, summary, positionMenu)
      : undefined;

    // Compute recheckInSec deterministically from traits
    const traits = summary.heroState.traits;
    const recheckInSec =
      AI_CONFIG.recheckInterval.base + (1 - traits.decisiveness) * AI_CONFIG.recheckInterval.scale;

    const rationaleTag = groupOrders?.length
      ? 'llm_group_orders'
      : `llm_${raw.intent}`;

    return {
      intent: raw.intent,
      targetId,
      moveTo: resolvedMoveTo,
      skillId: undefined,
      groupOrders,
      priority: raw.priority,
      rationaleTag,
      recheckInSec,
    };
  }

  private resolveGroupOrders(
    rawOrders: LLMGroupOrder[],
    summary: HeroSummary,
    positionMenu: TacticalPositionMenuResult
  ): GroupOrder[] | undefined {
    const heroPos = summary.heroState.position;
    const resolved: GroupOrder[] = [];

    for (const go of rawOrders) {
      const targetId = go.targetName
        ? this.vocabulary.resolveNickname(go.targetName)
        : undefined;
      const moveTo = go.moveOption
        ? resolveMoveOption(positionMenu, go.moveOption, heroPos)
        : undefined;

      // If focus with target but no position, use target's location
      const resolvedMoveTo =
        !moveTo && targetId && go.intent === 'focus_enemy'
          ? this.findUnitPosition(targetId, summary)
          : moveTo;

      resolved.push({
        group: go.group,
        intent: go.intent,
        targetId,
        moveTo: resolvedMoveTo,
      });
    }

    return resolved.length > 0 ? resolved : undefined;
  }

  private findUnitPosition(
    unitId: string,
    summary: HeroSummary
  ): { x: number; y: number } | undefined {
    const allUnits = [...summary.nearbyAllies, ...summary.nearbyEnemies];
    const unit = allUnits.find((u) => u.id === unitId);
    return unit ? { ...unit.position } : undefined;
  }
}
