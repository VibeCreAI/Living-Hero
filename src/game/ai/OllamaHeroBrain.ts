import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { GroupOrder, HeroDecision, HeroSummary } from '../types';
import {
  ChatMessage,
  LLMClient,
  LLMGroupOrder,
  LLMRawDecisionPlan,
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
  private pending = false;

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

      const positionMenu = buildTacticalPositionMenu(summary);
      const systemPrompt = buildHeroSystemPrompt(summary.heroState);
      const contextPrompt = buildContextPrompt(
        summary,
        positionMenu,
        this.vocabulary,
        playerMessage,
        terrainDescription
      );

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextPrompt },
      ];

      const start = performance.now();
      const response = await this.client.chat(messages);
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
      };
    } catch {
      this.fallbackCount++;
      return {
        decision: this.fallback.decide(summary),
        chatResponse: '',
        positionMenu: buildTacticalPositionMenu(summary),
        vocabulary: this.vocabulary,
      };
    } finally {
      this.pending = false;
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
      return trimmed;
    }

    if (decision.groupOrders?.length || !this.mentionsSplitGroups(trimmed)) {
      return trimmed;
    }

    return this.buildArmyOnlyAck(decision);
  }

  private mentionsSplitGroups(chatResponse: string): boolean {
    return /(?:^|[.!?]\s*)warriors\b|(?:^|[.!?]\s*)(?:archers|ranged)\b|\bwarriors\b.*\b(?:archers|ranged)\b|\b(?:archers|ranged)\b.*\bwarriors\b/i.test(
      chatResponse
    );
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
}
