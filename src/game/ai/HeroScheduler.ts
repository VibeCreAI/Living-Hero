import { BattleState, GroupOrder, HeroDecision, HeroSummary, UnitState } from '../types';
import { Hero } from '../entities/Hero';
import { Unit } from '../entities/Unit';
import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { OllamaHeroBrain } from './OllamaHeroBrain';
import { IntentExecutor } from './IntentExecutor';
import { buildHeroSummary } from './HeroSummaryBuilder';
import { EventBus } from '../EventBus';
import { interpretPlayerMessage } from './PlayerMessageInterpreter';
import { adaptReactiveDecision } from './DirectiveTactics';
import { BattleVocabulary } from './BattleVocabulary';
import { BattleGrid } from '../systems/BattleGrid';

export class HeroScheduler {
  private decisionProvider: IHeroDecisionProvider;
  private ollamaBrain: OllamaHeroBrain | null;
  private intentExecutor: IntentExecutor;
  private timers: Map<string, number> = new Map();
  private pendingHeroes: Set<string> = new Set();
  private requestVersions: Map<string, number> = new Map();
  private baseDecisions: Map<string, HeroDecision> = new Map();
  private queuedResults: Map<string, QueuedDecisionResult> = new Map();
  private reactiveLocks: Map<string, ReactiveDecisionLock> = new Map();
  private pendingDirectives: Map<string, string> = new Map();
  private terrainDescription: string | undefined;
  /** Shared vocabulary — set once at battle start via initVocabulary() */
  private vocabulary: BattleVocabulary = new BattleVocabulary();
  /** Track last known state for event-driven recheck triggers */
  private lastEnemyCount: Map<string, number> = new Map();
  private lastAllyMinHpPct: Map<string, number> = new Map();

  constructor(
    decisionProvider: IHeroDecisionProvider,
    ollamaBrain?: OllamaHeroBrain
  ) {
    this.decisionProvider = decisionProvider;
    this.ollamaBrain = ollamaBrain ?? null;
    this.intentExecutor = new IntentExecutor();
  }

  setBattleGrid(battleGrid: BattleGrid): void {
    this.intentExecutor.setBattleGrid(battleGrid);
  }

  /** Initialize vocabulary with unit nicknames at battle start */
  initVocabulary(alliedUnits: UnitState[], enemyUnits: UnitState[]): void {
    this.vocabulary.assignNicknames(alliedUnits, enemyUnits);
    if (this.ollamaBrain) {
      this.ollamaBrain.vocabulary = this.vocabulary;
    }
  }

  setPlayerDirective(directive: string, targetHeroIds: string[]): void {
    for (const heroId of targetHeroIds) {
      this.pendingDirectives.set(heroId, directive);
      this.timers.set(heroId, Infinity);
    }
  }

  setTerrainDescription(description: string): void {
    this.terrainDescription = description;
  }

  update(
    dt: number,
    heroes: Hero[],
    battleState: BattleState,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): void {
    for (const hero of heroes) {
      const heroId = hero.state.id;
      const incomingDirective = this.pendingDirectives.get(heroId);
      let directiveConsumed = !incomingDirective;
      if (incomingDirective) {
        hero.setDirective(incomingDirective);
        this.baseDecisions.delete(heroId);
        this.queuedResults.delete(heroId);
        this.reactiveLocks.delete(heroId);
      }

      const summary = buildHeroSummary(hero.state, battleState);
      const activeDirective = incomingDirective ?? summary.currentDirective;
      const parsedDirective = activeDirective
        ? interpretPlayerMessage(summary, activeDirective, this.terrainDescription)
        : null;

      // ── Interim decision: apply parsed directive immediately while LLM processes ──
      if (incomingDirective && this.ollamaBrain && parsedDirective) {
        // Emit parsed event for UI feedback
        EventBus.emit('directive-parsed', {
          heroId,
          heroName: hero.state.name,
          directive: incomingDirective,
          parsedIntent: parsedDirective.intent,
          parsedGroupOrders: parsedDirective.groupOrders,
        });

        // Apply interim decision so units move immediately
        const interimDecision = this.applyDirectiveStructure(
          summary,
          parsedDirective,
          parsedDirective
        );
        this.baseDecisions.set(heroId, interimDecision);
        hero.setDecision(interimDecision);
        this.intentExecutor.execute(hero, interimDecision, alliedUnits, enemyUnits);
      }

      let queuedChatResponse: string | undefined;

      // ── Process queued LLM result ──
      const queuedResult = this.queuedResults.get(heroId);
      if (queuedResult) {
        this.queuedResults.delete(heroId);
        const resolvedQueuedDecision = this.resolveQueuedDecision(
          queuedResult,
          activeDirective,
          parsedDirective
        );
        if (resolvedQueuedDecision.parsedDecision && activeDirective) {
          EventBus.emit('directive-parsed', {
            heroId,
            heroName: hero.state.name,
            directive: activeDirective,
            parsedIntent: resolvedQueuedDecision.parsedDecision.intent,
            parsedGroupOrders: resolvedQueuedDecision.parsedDecision.groupOrders,
          });
        }
        const structuredDecision = this.applyDirectiveStructure(
          summary,
          resolvedQueuedDecision.decision,
          parsedDirective
        );
        this.baseDecisions.set(heroId, structuredDecision);
        queuedChatResponse = resolvedQueuedDecision.chatResponse;
        this.timers.set(heroId, 0);
      }

      // ── Execute current decision ──
      const baseDecision = this.baseDecisions.get(heroId);
      if (baseDecision) {
        const activeDecision = this.shouldPinParsedDirective(parsedDirective)
          ? this.pinDirectiveDecision(baseDecision, parsedDirective)
          : this.stabilizeDecision(
              heroId,
              summary,
              adaptReactiveDecision(summary, baseDecision)
            );
        hero.setDecision(activeDecision);
        this.intentExecutor.execute(hero, activeDecision, alliedUnits, enemyUnits);
        if (queuedChatResponse) {
          hero.setSpeech(queuedChatResponse);
          EventBus.emit('hero-chat-response', {
            heroId,
            heroName: hero.state.name,
            message: queuedChatResponse,
          });
        }
      }

      if (this.pendingHeroes.has(heroId)) {
        continue;
      }

      // ── Check if recheck is needed ──
      const elapsed = (this.timers.get(heroId) ?? 0) + dt;
      const recheckInterval = hero.state.currentDecision?.recheckInSec ?? 0;
      const eventTriggered = this.checkEventTriggers(heroId, summary);

      if (!incomingDirective && !eventTriggered && elapsed < recheckInterval) {
        this.timers.set(heroId, elapsed);
        continue;
      }

      // ── Request new decision ──
      if (this.ollamaBrain) {
        this.pendingHeroes.add(heroId);
        const directive = activeDirective;
        directiveConsumed = !incomingDirective ? directiveConsumed : true;
        const requestVersion = (this.requestVersions.get(heroId) ?? 0) + 1;
        this.requestVersions.set(heroId, requestVersion);
        const announceDirectiveInterpretation = Boolean(incomingDirective && !parsedDirective);

        this.ollamaBrain
          .decideAsync(summary, directive, this.terrainDescription)
          .then((result) => {
            if (this.requestVersions.get(heroId) !== requestVersion) {
              return;
            }
            this.queuedResults.set(heroId, {
              decision: result.decision,
              chatResponse: result.chatResponse,
              playerOrderInterpretation: result.playerOrderInterpretation,
              announceDirectiveInterpretation,
            });
          })
          .catch(() => {
            if (this.requestVersions.get(heroId) !== requestVersion) {
              return;
            }
            const liveSummary = buildHeroSummary(hero.state, battleState);
            const fallback = directive
              ? interpretPlayerMessage(liveSummary, directive, this.terrainDescription)
                ?? this.decisionProvider.decide(liveSummary)
              : this.decisionProvider.decide(liveSummary);
            this.queuedResults.set(heroId, { decision: fallback });
          })
          .finally(() => {
            if (this.requestVersions.get(heroId) !== requestVersion) {
              return;
            }
            this.pendingHeroes.delete(heroId);
            this.timers.set(heroId, 0);
          });
      } else {
        // No LLM — synchronous path
        const directive = activeDirective;
        directiveConsumed = !incomingDirective ? directiveConsumed : true;
        const decision = directive
          ? parsedDirective ?? this.decisionProvider.decide(summary)
          : this.decisionProvider.decide(summary);
        const structuredDecision = this.applyDirectiveStructure(summary, decision, parsedDirective);
        const activeDecision = this.stabilizeDecision(
          heroId,
          summary,
          adaptReactiveDecision(summary, structuredDecision)
        );
        this.baseDecisions.set(heroId, structuredDecision);
        hero.setDecision(activeDecision);
        this.intentExecutor.execute(hero, activeDecision, alliedUnits, enemyUnits);
        if (incomingDirective && parsedDirective) {
          // Emit parsed event for UI
          EventBus.emit('directive-parsed', {
            heroId,
            heroName: hero.state.name,
            directive: incomingDirective,
            parsedIntent: decision.intent,
            parsedGroupOrders: decision.groupOrders,
          });
        }
        if (incomingDirective) {
          const response = this.buildFallbackAck(activeDecision);
          hero.setSpeech(response);
          EventBus.emit('hero-chat-response', {
            heroId,
            heroName: hero.state.name,
            message: response,
          });
        }
        this.timers.set(heroId, 0);
      }

      if (directiveConsumed) {
        this.pendingDirectives.delete(heroId);
      }
    }
  }

  // ── Event-driven recheck triggers ──

  private checkEventTriggers(heroId: string, summary: HeroSummary): boolean {
    const aliveEnemies = summary.nearbyEnemies.filter((u) => u.state !== 'dead');
    const aliveAllies = summary.nearbyAllies.filter((u) => u.state !== 'dead');

    // Enemy count changed (unit died)
    const prevEnemyCount = this.lastEnemyCount.get(heroId) ?? aliveEnemies.length;
    this.lastEnemyCount.set(heroId, aliveEnemies.length);
    if (aliveEnemies.length < prevEnemyCount) {
      return true;
    }

    // Ally dropped below 30% HP
    const minAllyHpPct = aliveAllies.length > 0
      ? Math.min(...aliveAllies.map((u) => u.hp / u.maxHp))
      : 1;
    const prevMinHp = this.lastAllyMinHpPct.get(heroId) ?? 1;
    this.lastAllyMinHpPct.set(heroId, minAllyHpPct);
    if (minAllyHpPct < 0.3 && prevMinHp >= 0.3) {
      return true;
    }

    return false;
  }

  private buildFallbackAck(decision: HeroDecision): string {
    if (decision.groupOrders?.length) {
      const parts = decision.groupOrders.map((go) => {
        const intentLabel = go.intent.replace(/_/g, ' ').replace(' to point', '').replace(' position', '');
        return `${go.group}: ${intentLabel}`;
      });
      return `Split orders: ${parts.join(', ')}.`;
    }

    switch (decision.intent) {
      case 'retreat_to_point':
        return 'Retreating to the assigned position.';
      case 'hold_position':
        return 'Holding at the ordered position.';
      case 'protect_target':
        return 'Shifting into a protective screen.';
      case 'focus_enemy':
        return 'Committing all units to the ordered target.';
      case 'advance_to_point':
        return 'Advancing to the ordered position.';
      case 'use_skill':
        return 'Executing the ordered action.';
    }
  }

  private stabilizeDecision(
    heroId: string,
    summary: HeroSummary,
    candidate: HeroDecision
  ): HeroDecision {
    const existingLock = this.reactiveLocks.get(heroId);
    if (this.isReactiveHarasserDecision(candidate) && candidate.targetId) {
      const target = summary.nearbyEnemies.find((enemy) => enemy.id === candidate.targetId);
      const lockedDecision = target
        ? { ...candidate, moveToTile: { ...target.tile } }
        : candidate;
      this.reactiveLocks.set(heroId, {
        decision: lockedDecision,
        holdUntilSec: summary.timeSec + REACTIVE_LOCK_SEC,
      });
      return lockedDecision;
    }

    if (!existingLock) {
      return candidate;
    }

    const lockedTargetId = existingLock.decision.targetId;
    const lockedTarget = lockedTargetId
      ? summary.nearbyEnemies.find((enemy) => enemy.id === lockedTargetId)
      : undefined;
    if (!lockedTarget) {
      this.reactiveLocks.delete(heroId);
      return candidate;
    }

    const lastHitAge = this.getLastAlliedHitAge(summary, lockedTarget.id);
    const keepLock =
      summary.timeSec < existingLock.holdUntilSec ||
      (lastHitAge !== undefined && lastHitAge <= REACTIVE_RELEASE_GRACE_SEC);

    if (!keepLock) {
      this.reactiveLocks.delete(heroId);
      return candidate;
    }

    const refreshedLock: HeroDecision = {
      ...existingLock.decision,
      moveToTile: { ...lockedTarget.tile },
      targetId: lockedTarget.id,
      recheckInSec: Math.min(existingLock.decision.recheckInSec, REACTIVE_LOCK_SEC),
    };
    this.reactiveLocks.set(heroId, {
      decision: refreshedLock,
      holdUntilSec: Math.max(
        existingLock.holdUntilSec,
        summary.timeSec + (lastHitAge !== undefined ? REACTIVE_LOCK_SEC * 0.5 : 0)
      ),
    });
    return refreshedLock;
  }

  private isReactiveHarasserDecision(decision: HeroDecision): boolean {
    return (
      decision.intent === 'focus_enemy' &&
      decision.rationaleTag.includes('harasser')
    );
  }

  private getLastAlliedHitAge(
    summary: HeroSummary,
    attackerId: string
  ): number | undefined {
    let latestTime = -1;

    for (const event of summary.recentDamage) {
      if (
        event.attackerId === attackerId &&
        event.targetFaction === 'allied' &&
        event.attackerFaction === 'enemy'
      ) {
        latestTime = Math.max(latestTime, event.timeSec);
      }
    }

    return latestTime >= 0 ? summary.timeSec - latestTime : undefined;
  }

  private applyDirectiveStructure(
    summary: HeroSummary,
    decision: HeroDecision,
    parsedDirectiveOverride?: HeroDecision | null
  ): HeroDecision {
    const directive = summary.currentDirective;
    if (!directive) {
      return decision;
    }

    const parsedDirective =
      parsedDirectiveOverride !== undefined
        ? parsedDirectiveOverride
        : interpretPlayerMessage(summary, directive, this.terrainDescription);
    if (!parsedDirective) {
      return decision;
    }

    let structuredDecision = this.mergeDirectiveDetails(directive, decision, parsedDirective);
    if (!parsedDirective.groupOrders?.length) {
      return structuredDecision;
    }

    const mergedGroupOrders = this.mergeGroupOrders(
      structuredDecision.groupOrders,
      parsedDirective.groupOrders
    );
    if (!mergedGroupOrders?.length) {
      return structuredDecision;
    }

    return {
      ...structuredDecision,
      groupOrders: mergedGroupOrders,
      groupOrderMode: parsedDirective.groupOrderMode ?? structuredDecision.groupOrderMode,
      rationaleTag: this.appendDirectiveTag(structuredDecision.rationaleTag, 'directive_groups'),
    };
  }

  private mergeDirectiveDetails(
    directive: string,
    decision: HeroDecision,
    parsedDirective: HeroDecision
  ): HeroDecision {
    const structuredDecision: HeroDecision = {
      ...decision,
      moveToTile: decision.moveToTile ? { ...decision.moveToTile } : undefined,
      groupOrders: decision.groupOrders?.map((groupOrder) => ({
        ...groupOrder,
        moveToTile: groupOrder.moveToTile ? { ...groupOrder.moveToTile } : undefined,
      })),
    };
    const directiveHasSpatialReference = SPATIAL_DIRECTION_PATTERN.test(directive);

    if (this.shouldPinParsedDirective(parsedDirective)) {
      return this.pinDirectiveDecision(structuredDecision, parsedDirective);
    }

    if (
      parsedDirective.targetId &&
      !structuredDecision.targetId &&
      structuredDecision.intent === parsedDirective.intent
    ) {
      structuredDecision.targetId = parsedDirective.targetId;
    }

    if (
      parsedDirective.moveToTile &&
      this.shouldApplyDirectiveMoveTo(
        structuredDecision,
        parsedDirective,
        directiveHasSpatialReference
      )
    ) {
      structuredDecision.moveToTile = { ...parsedDirective.moveToTile };
      structuredDecision.rationaleTag = this.appendDirectiveTag(
        structuredDecision.rationaleTag,
        'directive_anchor'
      );
    }

    return structuredDecision;
  }

  private shouldApplyDirectiveMoveTo(
    decision: HeroDecision,
    parsedDirective: HeroDecision,
    directiveHasSpatialReference: boolean
  ): boolean {
    if (!parsedDirective.moveToTile) {
      return false;
    }

    if (decision.intent === parsedDirective.intent) {
      return directiveHasSpatialReference || !decision.moveToTile;
    }

    return (
      isPositionalIntent(decision.intent) &&
      isPositionalIntent(parsedDirective.intent) &&
      (directiveHasSpatialReference || !decision.moveToTile)
    );
  }

  private appendDirectiveTag(rationaleTag: string, suffix: string): string {
    return rationaleTag.includes(suffix) ? rationaleTag : `${rationaleTag}_${suffix}`;
  }

  private shouldPinParsedDirective(parsedDirective: HeroDecision | null | undefined): boolean {
    if (!parsedDirective?.moveToTile) {
      return false;
    }

    return (
      parsedDirective.intent === 'advance_to_point' ||
      parsedDirective.intent === 'retreat_to_point'
    );
  }

  private pinDirectiveDecision(decision: HeroDecision, parsedDirective: HeroDecision): HeroDecision {
    const pinnedDecision: HeroDecision = {
      ...decision,
      intent: parsedDirective.intent,
      moveToTile: parsedDirective.moveToTile ? { ...parsedDirective.moveToTile } : undefined,
      targetId: parsedDirective.targetId,
      rationaleTag: this.appendDirectiveTag(decision.rationaleTag, 'directive_pinned'),
    };

    if (!parsedDirective.groupOrders?.length) {
      pinnedDecision.groupOrders = undefined;
      pinnedDecision.groupOrderMode = undefined;
      return pinnedDecision;
    }

    pinnedDecision.groupOrders = parsedDirective.groupOrders.map((groupOrder) => ({
      ...groupOrder,
      moveToTile: groupOrder.moveToTile ? { ...groupOrder.moveToTile } : undefined,
    }));
    pinnedDecision.groupOrderMode = parsedDirective.groupOrderMode;
    return pinnedDecision;
  }

  private mergeGroupOrders(
    currentOrders: HeroDecision['groupOrders'],
    directiveOrders: HeroDecision['groupOrders']
  ): HeroDecision['groupOrders'] {
    if (!directiveOrders?.length) {
      return currentOrders;
    }

    if (!currentOrders?.length) {
      return directiveOrders.map((groupOrder) => ({
        ...groupOrder,
        moveToTile: groupOrder.moveToTile ? { ...groupOrder.moveToTile } : undefined,
      }));
    }

    const merged = new Map<string, GroupOrder>();
    for (const groupOrder of currentOrders) {
      merged.set(groupOrder.group, {
        ...groupOrder,
        moveToTile: groupOrder.moveToTile ? { ...groupOrder.moveToTile } : undefined,
      });
    }

    for (const directiveOrder of directiveOrders) {
      const existing = merged.get(directiveOrder.group);
      if (!existing) {
        merged.set(directiveOrder.group, {
          ...directiveOrder,
          moveToTile: directiveOrder.moveToTile ? { ...directiveOrder.moveToTile } : undefined,
        });
        continue;
      }

      merged.set(directiveOrder.group, {
        ...existing,
        intent: directiveOrder.intent,
        targetId: directiveOrder.targetId ?? existing.targetId,
        moveToTile: directiveOrder.moveToTile
          ? { ...directiveOrder.moveToTile }
          : existing.moveToTile
            ? { ...existing.moveToTile }
            : undefined,
      });
    }

    return [...merged.values()];
  }

  private resolveQueuedDecision(
    queuedResult: QueuedDecisionResult,
    directive: string | undefined,
    parsedDirective: HeroDecision | null
  ): ResolvedQueuedDecision {
    if (!directive || parsedDirective || !queuedResult.playerOrderInterpretation) {
      return {
        decision: queuedResult.decision,
        chatResponse: queuedResult.chatResponse,
      };
    }

    return {
      decision: queuedResult.playerOrderInterpretation,
      chatResponse: queuedResult.announceDirectiveInterpretation
        ? this.buildFallbackAck(queuedResult.playerOrderInterpretation)
        : undefined,
      parsedDecision: queuedResult.announceDirectiveInterpretation
        ? queuedResult.playerOrderInterpretation
        : undefined,
    };
  }
}

interface QueuedDecisionResult {
  decision: HeroDecision;
  chatResponse?: string;
  playerOrderInterpretation?: HeroDecision;
  announceDirectiveInterpretation?: boolean;
}

interface ResolvedQueuedDecision {
  decision: HeroDecision;
  chatResponse?: string;
  parsedDecision?: HeroDecision;
}

interface ReactiveDecisionLock {
  decision: HeroDecision;
  holdUntilSec: number;
}

const REACTIVE_LOCK_SEC = 1.25;
const REACTIVE_RELEASE_GRACE_SEC = 1.75;
const SPATIAL_DIRECTION_PATTERN =
  /\b(north|south|east|west|top|bottom|left|right|upper|lower|up|down|center|middle)\b|\b(1[0-2]|[1-9])(?::([03]0))?\s*(?:o\s*clock|o'clock|oclock)\b(?:\s+direction)?/i;

function isPositionalIntent(intent: HeroDecision['intent']): boolean {
  return (
    intent === 'advance_to_point' ||
    intent === 'hold_position' ||
    intent === 'protect_target' ||
    intent === 'retreat_to_point'
  );
}
