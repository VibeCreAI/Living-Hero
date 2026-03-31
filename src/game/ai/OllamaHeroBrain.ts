import { IHeroDecisionProvider } from './HeroDecisionProvider';
import {
  ChainControl,
  GroupOrder,
  HeroDecision,
  HeroSummary,
  ReservedChainStep,
  UnitGroup,
} from '../types';
import {
  ChatMessage,
  LLMClient,
  LLMGroupOrder,
  LLMRawDecisionPlan,
  LLMRawReservedChainStep,
} from './LLMClient';
import { buildHeroSystemPrompt } from './heroPrompts';
import { buildContextPrompt } from './contextBuilder';
import { LocalRuleBasedHeroBrain } from './LocalRuleBasedHeroBrain';
import { AI_CONFIG, OLLAMA_CONFIG } from './config';
import { BattleVocabulary } from './BattleVocabulary';
import {
  TacticalPositionMenuResult,
  buildTacticalPositionMenu,
  resolveMoveOption,
} from './TacticalPositionMenu';

export interface OllamaDecisionResult {
  decision: HeroDecision;
  playerOrderInterpretation?: HeroDecision;
  chatResponse: string;
  positionMenu: TacticalPositionMenuResult;
  vocabulary: BattleVocabulary;
  chainControl?: ChainControl;
  source: 'llm' | 'fallback';
}

export interface OllamaOpeningPlanResult {
  openingDecision: HeroDecision;
  planSummary: string;
  reservedSteps: ReservedChainStep[];
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

export class OllamaHeroBrain implements IHeroDecisionProvider {
  private client: LLMClient;
  private fallback: LocalRuleBasedHeroBrain;
  private pendingDecision = false;
  private pendingOpeningPlanPromise: Promise<OllamaOpeningPlanResult> | null = null;

  vocabulary: BattleVocabulary = new BattleVocabulary();
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

  decide(summary: HeroSummary): HeroDecision {
    return this.fallback.decide(summary);
  }

  async decideAsync(
    summary: HeroSummary,
    playerMessage?: string,
    terrainDescription?: string,
    options: { openingStrategy?: boolean } = {}
  ): Promise<OllamaDecisionResult> {
    if (this.pendingDecision) {
      return {
        decision: FALLBACK_DECISION,
        chatResponse: '',
        positionMenu: buildTacticalPositionMenu(summary),
        vocabulary: this.vocabulary,
        source: 'fallback',
      };
    }

    this.pendingDecision = true;

    try {
      const isHealthy = this.client.isAvailable() || (await this.client.healthCheck());
      if (!isHealthy) {
        throw new Error('Ollama unavailable');
      }

      const positionMenu = buildTacticalPositionMenu(summary);
      const systemPrompt = buildHeroSystemPrompt(summary.heroState);
      const contextPrompt = buildContextPrompt(
        summary,
        positionMenu,
        this.vocabulary,
        playerMessage,
        terrainDescription,
        options
      );

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextPrompt },
      ];

      const requestOptions = options.openingStrategy
        ? {
            maxTokens: OLLAMA_CONFIG.openingMaxTokens,
            temperature: OLLAMA_CONFIG.openingTemperature,
            timeoutMs: OLLAMA_CONFIG.openingTimeoutMs,
          }
        : undefined;

      const start = performance.now();
      const response = await this.client.chat(messages, requestOptions);
      this.lastLatencyMs = performance.now() - start;
      this.llmCallCount++;
      const decision = this.resolveRawDecision(response.raw, summary, positionMenu, 'llm');
      const playerOrderInterpretation = response.raw.playerOrderInterpretation
        ? this.resolveRawDecision(
            response.raw.playerOrderInterpretation,
            summary,
            positionMenu,
            'llm_player_order'
          )
        : undefined;

      return {
        decision,
        playerOrderInterpretation,
        chatResponse: this.normalizeChatResponse(response.chatResponse, decision),
        positionMenu,
        vocabulary: this.vocabulary,
        chainControl: response.raw.chainControl,
        source: 'llm',
      };
    } catch {
      this.fallbackCount++;
      const fallbackDecision = this.fallback.decide(summary);
      return {
        decision: fallbackDecision,
        chatResponse: this.buildFallbackChatResponse(fallbackDecision),
        positionMenu: buildTacticalPositionMenu(summary),
        vocabulary: this.vocabulary,
        source: 'fallback',
      };
    } finally {
      this.pendingDecision = false;
    }
  }

  async planOpeningStrategyAsync(
    summary: HeroSummary,
    playerMessage?: string,
    terrainDescription?: string
  ): Promise<OllamaOpeningPlanResult> {
    if (this.pendingOpeningPlanPromise) {
      return this.pendingOpeningPlanPromise;
    }

    this.pendingOpeningPlanPromise = (async () => {
      const isHealthy = this.client.isAvailable() || (await this.client.healthCheck());
      if (!isHealthy) {
        throw new Error('Ollama unavailable');
      }

      const positionMenu = buildTacticalPositionMenu(summary);
      const systemPrompt = buildHeroSystemPrompt(summary.heroState);
      const contextPrompt = buildContextPrompt(
        summary,
        positionMenu,
        this.vocabulary,
        playerMessage,
        terrainDescription,
        {
          openingStrategy: true,
          openingPlanMode: true,
        }
      );

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextPrompt },
      ];

      const requestOptions = {
        maxTokens: OLLAMA_CONFIG.openingMaxTokens,
        temperature: OLLAMA_CONFIG.openingTemperature,
        timeoutMs: OLLAMA_CONFIG.openingTimeoutMs,
      };

      try {
        const start = performance.now();
        const response = await this.client.planOpeningStrategy(messages, requestOptions);
        this.lastLatencyMs = performance.now() - start;
        this.llmCallCount++;

        const openingDecision = this.resolveRawDecision(
          response.raw,
          summary,
          positionMenu,
          'opening_plan'
        );
        let reservedSteps = (response.raw.reservedSteps ?? []).map((step, index) =>
          this.resolveReservedStep(step, summary, positionMenu, `opening_chain_${index + 1}`)
        );
        if (reservedSteps.length === 0) {
          reservedSteps = await this.generateReservedSteps(
            messages,
            response.raw,
            summary,
            positionMenu,
            requestOptions
          );
        }
        const chatResponse = this.normalizeChatResponse(response.raw.chatResponse, openingDecision);
        const planSummary = this.normalizePlanSummary(
          response.raw.planSummary,
          openingDecision,
          reservedSteps
        );

        return {
          openingDecision,
          planSummary,
          reservedSteps,
          chatResponse,
          positionMenu,
          vocabulary: this.vocabulary,
        };
      } catch {
        const start = performance.now();
        const response = await this.client.chat(messages, requestOptions);
        this.lastLatencyMs = performance.now() - start;
        this.llmCallCount++;

        const openingDecision = this.resolveRawDecision(
          response.raw,
          summary,
          positionMenu,
          'opening_plan_fallback'
        );
        const chatResponse = this.normalizeChatResponse(response.chatResponse, openingDecision);
        const reservedSteps = await this.generateReservedSteps(
          messages,
          {
            ...response.raw,
            chatResponse,
            planSummary: '',
          },
          summary,
          positionMenu,
          requestOptions
        );

        return {
          openingDecision,
          planSummary: this.normalizePlanSummary('', openingDecision, reservedSteps),
          reservedSteps,
          chatResponse,
          positionMenu,
          vocabulary: this.vocabulary,
        };
      }
    })();

    try {
      return await this.pendingOpeningPlanPromise;
    } finally {
      this.pendingOpeningPlanPromise = null;
    }
  }

  startHealthChecks(): () => void {
    const interval = setInterval(() => {
      this.client.healthCheck();
    }, OLLAMA_CONFIG.healthCheckIntervalMs);
    return () => clearInterval(interval);
  }

  resetConversation(): void {
    this.lastLatencyMs = 0;
    this.fallbackCount = 0;
    this.llmCallCount = 0;
  }

  private resolveRawDecision(
    raw: LLMRawDecisionPlan,
    summary: HeroSummary,
    positionMenu: TacticalPositionMenuResult,
    rationalePrefix: string
  ): HeroDecision {
    const targetId = raw.targetName ? this.vocabulary.resolveNickname(raw.targetName) : undefined;
    const moveToTile = raw.moveOption ? resolveMoveOption(positionMenu, raw.moveOption) : undefined;
    const resolvedMoveToTile =
      !moveToTile && targetId && raw.intent === 'focus_enemy'
        ? this.findUnitTile(targetId, summary)
        : moveToTile;

    const groupOrders = raw.groupOrders
      ? this.resolveGroupOrders(raw.groupOrders, summary, positionMenu)
      : undefined;

    const traits = summary.heroState.traits;
    const recheckInSec =
      AI_CONFIG.recheckInterval.base + (1 - traits.decisiveness) * AI_CONFIG.recheckInterval.scale;

    return {
      intent: raw.intent,
      targetId,
      moveToTile: resolvedMoveToTile,
      skillId: undefined,
      groupOrders,
      priority: raw.priority,
      rationaleTag: groupOrders?.length
        ? `${rationalePrefix}_group_orders`
        : `${rationalePrefix}_${raw.intent}`,
      recheckInSec,
    };
  }

  private resolveReservedStep(
    raw: LLMRawReservedChainStep,
    summary: HeroSummary,
    positionMenu: TacticalPositionMenuResult,
    rationalePrefix: string
  ): ReservedChainStep {
    const decision = this.resolveRawDecision(raw, summary, positionMenu, rationalePrefix);
    return {
      ...decision,
      trigger: raw.trigger,
      chatResponse: this.normalizeChatResponse(raw.chatResponse, decision),
      summary: this.normalizeReservedStepSummary(raw.summary, decision),
    };
  }

  private resolveGroupOrders(
    rawOrders: LLMGroupOrder[],
    summary: HeroSummary,
    positionMenu: TacticalPositionMenuResult
  ): GroupOrder[] | undefined {
    const resolved = new Map<string, GroupOrder>();

    for (const groupOrder of rawOrders) {
      const targetId = groupOrder.targetName
        ? this.vocabulary.resolveNickname(groupOrder.targetName)
        : undefined;
      const moveToTile = groupOrder.moveOption
        ? resolveMoveOption(positionMenu, groupOrder.moveOption)
        : undefined;
      const resolvedMoveToTile =
        !moveToTile && targetId && groupOrder.intent === 'focus_enemy'
          ? this.findUnitTile(targetId, summary)
          : moveToTile;

      resolved.set(groupOrder.group, {
        group: groupOrder.group,
        intent: groupOrder.intent,
        targetId,
        moveToTile: resolvedMoveToTile,
      });
    }

    return resolved.size > 0 ? [...resolved.values()] : undefined;
  }

  private findUnitTile(unitId: string, summary: HeroSummary) {
    const allUnits = [...summary.nearbyAllies, ...summary.nearbyEnemies];
    const unit = allUnits.find((candidate) => candidate.id === unitId);
    return unit ? { ...unit.tile } : undefined;
  }

  private normalizeChatResponse(chatResponse: string, decision: HeroDecision): string {
    const trimmed = chatResponse.trim();
    if (!trimmed) {
      return this.buildFallbackChatResponse(decision);
    }

    if (decision.groupOrders?.length || !this.mentionsSplitGroups(trimmed)) {
      return trimmed;
    }

    return this.buildFallbackChatResponse(decision);
  }

  private normalizePlanSummary(
    planSummary: string,
    openingDecision: HeroDecision,
    reservedSteps: ReservedChainStep[]
  ): string {
    const trimmed = planSummary.trim();
    if (trimmed) {
      return trimmed;
    }

    const firstFollowUp = reservedSteps[0]?.summary;
    return firstFollowUp
      ? `${this.describeDecision(openingDecision)} Then ${firstFollowUp}.`
      : this.describeDecision(openingDecision);
  }

  private normalizeReservedStepSummary(summary: string, decision: HeroDecision): string {
    const trimmed = summary.trim();
    return trimmed || this.describeDecision(decision);
  }

  private async generateReservedSteps(
    messages: ChatMessage[],
    openingPlan: LLMRawDecisionPlan & { chatResponse?: string; planSummary?: string },
    summary: HeroSummary,
    positionMenu: TacticalPositionMenuResult,
    requestOptions: { maxTokens: number; temperature: number; timeoutMs: number }
  ): Promise<ReservedChainStep[]> {
    const refinementMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'assistant',
        content: JSON.stringify({
          chatResponse: openingPlan.chatResponse ?? '',
          planSummary: openingPlan.planSummary ?? '',
          intent: openingPlan.intent,
          targetName: openingPlan.targetName,
          moveOption: openingPlan.moveOption,
          priority: openingPlan.priority,
          groupOrders: openingPlan.groupOrders,
        }),
      },
      {
        role: 'user',
        content:
          'CHAIN REFINEMENT MODE: keep the approved opening decision above. Now add 1 or 2 reserved follow-up steps for first contact and combat_started whenever sensible. Prefer enemy_in_range for the first contact step and combat_started for the next commitment step. Return no empty array unless there is truly no meaningful continuation.',
      },
    ];

    try {
      const response = await this.client.planReservedSteps(refinementMessages, {
        maxTokens: Math.min(requestOptions.maxTokens, 220),
        temperature: requestOptions.temperature,
        timeoutMs: Math.min(requestOptions.timeoutMs, 6000),
      });

      return response.reservedSteps.map((step, index) =>
        this.resolveReservedStep(step, summary, positionMenu, `opening_chain_refined_${index + 1}`)
      );
    } catch {
      return [];
    }
  }

  private mentionsSplitGroups(chatResponse: string): boolean {
    return /(?:^|[.!?]\s*)warriors\b|(?:^|[.!?]\s*)(?:archers|ranged)\b|\bwarriors\b.*\b(?:archers|ranged)\b|\b(?:archers|ranged)\b.*\bwarriors\b/i.test(
      chatResponse
    );
  }

  private describeDecision(decision: HeroDecision): string {
    if (decision.groupOrders?.length) {
      return this.buildGroupOrdersAck(decision.groupOrders);
    }

    const targetName = decision.targetId
      ? this.vocabulary.getNickname(decision.targetId)
      : undefined;
    const moveLabel = decision.moveToTile
      ? `[${decision.moveToTile.col}, ${decision.moveToTile.row}]`
      : undefined;

    switch (decision.intent) {
      case 'focus_enemy':
        return targetName ? `Focus ${targetName}.` : 'Focus the marked enemy.';
      case 'protect_target':
        return targetName ? `Protect ${targetName}.` : 'Protect the line.';
      case 'advance_to_point':
        return moveLabel ? `Advance to ${moveLabel}.` : 'Advance to the marked position.';
      case 'retreat_to_point':
        return moveLabel ? `Retreat to ${moveLabel}.` : 'Retreat to the marked position.';
      case 'hold_position':
        return moveLabel ? `Hold at ${moveLabel}.` : 'Hold this ground.';
      case 'use_skill':
        return 'Use your skill on cue.';
    }
  }

  private buildArmyOnlyAck(decision: HeroDecision): string {
    const targetName = decision.targetId
      ? this.vocabulary.getNickname(decision.targetId)
      : undefined;

    switch (decision.intent) {
      case 'focus_enemy':
        return targetName
          ? `All together - break ${targetName}.`
          : 'All together - break their line.';
      case 'protect_target':
        return targetName
          ? `Close ranks and screen ${targetName}.`
          : 'Close ranks and screen the line.';
      case 'advance_to_point':
        return 'Advance together and keep formation.';
      case 'retreat_to_point':
        return 'Fall back together and regroup.';
      case 'hold_position':
        return 'Hold together and wait for the opening.';
      case 'use_skill':
        return 'Stay with me and press the action.';
    }
  }

  private buildFallbackChatResponse(decision: HeroDecision): string {
    if (decision.groupOrders?.length) {
      return this.buildGroupOrdersAck(decision.groupOrders);
    }

    return this.buildArmyOnlyAck(decision);
  }

  private buildGroupOrdersAck(groupOrders: GroupOrder[]): string {
    const armyOrder = groupOrders.find((groupOrder) => groupOrder.group === 'all');
    if (armyOrder) {
      return this.buildArmyOnlyAck({
        intent: armyOrder.intent,
        targetId: armyOrder.targetId,
        moveToTile: armyOrder.moveToTile,
        priority: 'medium',
        rationaleTag: 'fallback_group_all',
        recheckInSec: 2,
      });
    }

    const priority: UnitGroup[] = ['hero', 'warriors', 'archers'];
    const clauses = priority
      .map((group) => groupOrders.find((groupOrder) => groupOrder.group === group))
      .filter((groupOrder): groupOrder is GroupOrder => Boolean(groupOrder))
      .map((groupOrder) => this.describeGroupOrder(groupOrder));

    return clauses.join(' ');
  }

  private describeGroupOrder(groupOrder: GroupOrder): string {
    const label =
      groupOrder.group === 'archers'
        ? 'Ranged'
        : groupOrder.group === 'hero'
          ? 'I'
          : 'Warriors';
    const targetName = groupOrder.targetId
      ? this.vocabulary.getNickname(groupOrder.targetId)
      : undefined;

    switch (groupOrder.intent) {
      case 'focus_enemy':
        return targetName ? `${label} focus ${targetName}.` : `${label} focus the marked enemy.`;
      case 'protect_target':
        return targetName ? `${label} guard ${targetName}.` : `${label} guard the line.`;
      case 'advance_to_point':
        return `${label} advance to the marked position.`;
      case 'retreat_to_point':
        return `${label} fall back to the marked position.`;
      case 'hold_position':
        return `${label} hold this ground.`;
      case 'use_skill':
        return `${label} strike on my signal.`;
    }
  }
}
