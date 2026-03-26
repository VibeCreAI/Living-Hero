import { BattleState, GroupOrder, HeroDecision, HeroSummary } from '../types';
import { Hero } from '../entities/Hero';
import { Unit } from '../entities/Unit';
import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { OllamaHeroBrain } from './OllamaHeroBrain';
import { IntentExecutor } from './IntentExecutor';
import { buildHeroSummary } from './HeroSummaryBuilder';
import { EventBus } from '../EventBus';
import { interpretPlayerMessage } from './PlayerMessageInterpreter';
import { adaptReactiveDecision } from './DirectiveTactics';

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
  private pendingDirective: string | undefined;
  private terrainDescription: string | undefined;

  constructor(
    decisionProvider: IHeroDecisionProvider,
    ollamaBrain?: OllamaHeroBrain
  ) {
    this.decisionProvider = decisionProvider;
    this.ollamaBrain = ollamaBrain ?? null;
    this.intentExecutor = new IntentExecutor();
  }

  setPlayerDirective(directive: string): void {
    this.pendingDirective = directive;
    for (const [heroId] of this.timers) {
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
    const incomingDirective = this.pendingDirective;
    let directiveConsumed = !incomingDirective;

    for (const hero of heroes) {
      const heroId = hero.state.id;
      if (incomingDirective) {
        hero.setDirective(incomingDirective);
        this.baseDecisions.delete(heroId);
        this.queuedResults.delete(heroId);
        this.reactiveLocks.delete(heroId);
      }

      const summary = buildHeroSummary(hero.state, battleState);
      let queuedChatResponse: string | undefined;

      const queuedResult = this.queuedResults.get(heroId);
      if (queuedResult) {
        this.queuedResults.delete(heroId);
        const structuredDecision = this.applyDirectiveStructure(summary, queuedResult.decision);
        this.baseDecisions.set(heroId, structuredDecision);
        queuedChatResponse = queuedResult.chatResponse;
        this.timers.set(heroId, 0);
      }

      const baseDecision = this.baseDecisions.get(heroId);
      if (baseDecision) {
        const activeDecision = this.stabilizeDecision(
          heroId,
          summary,
          adaptReactiveDecision(summary, baseDecision)
        );
        hero.setDecision(activeDecision);
        this.intentExecutor.execute(hero, activeDecision, alliedUnits, enemyUnits);
        if (queuedChatResponse) {
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

      const elapsed = (this.timers.get(heroId) ?? 0) + dt;
      const recheckInterval = hero.state.currentDecision?.recheckInSec ?? 0;

      if (!incomingDirective && elapsed < recheckInterval) {
        this.timers.set(heroId, elapsed);
        continue;
      }

      if (this.ollamaBrain) {
        this.pendingHeroes.add(heroId);
        const directive = incomingDirective;
        directiveConsumed = true;
        const requestVersion = (this.requestVersions.get(heroId) ?? 0) + 1;
        this.requestVersions.set(heroId, requestVersion);

        this.ollamaBrain
          .decideAsync(summary, directive, this.terrainDescription)
          .then((result) => {
            if (this.requestVersions.get(heroId) !== requestVersion) {
              return;
            }
            this.queuedResults.set(heroId, {
              decision: result.decision,
              chatResponse: result.chatResponse,
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
        const directive = incomingDirective;
        directiveConsumed = true;
        const decision = directive
          ? interpretPlayerMessage(summary, directive, this.terrainDescription)
            ?? this.decisionProvider.decide(summary)
          : this.decisionProvider.decide(summary);
        const structuredDecision = this.applyDirectiveStructure(summary, decision);
        const activeDecision = this.stabilizeDecision(
          heroId,
          summary,
          adaptReactiveDecision(summary, structuredDecision)
        );
        this.baseDecisions.set(heroId, structuredDecision);
        hero.setDecision(activeDecision);
        this.intentExecutor.execute(hero, activeDecision, alliedUnits, enemyUnits);
        if (directive) {
          EventBus.emit('hero-chat-response', {
            heroId,
            heroName: hero.state.name,
            message: this.buildFallbackAck(activeDecision),
          });
        }
        this.timers.set(heroId, 0);
      }
    }

    this.pendingDirective = directiveConsumed ? undefined : incomingDirective;
  }

  private buildFallbackAck(decision: HeroDecision): string {
    if (decision.groupOrders?.length) {
      return 'Executing split squad orders.';
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
        ? { ...candidate, moveTo: { ...target.position } }
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
      moveTo: { ...lockedTarget.position },
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
    decision: HeroDecision
  ): HeroDecision {
    const directive = summary.currentDirective;
    if (!directive) {
      return decision;
    }

    const parsedDirective = interpretPlayerMessage(summary, directive, this.terrainDescription);
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
      moveTo: decision.moveTo ? { ...decision.moveTo } : undefined,
      groupOrders: decision.groupOrders?.map((groupOrder) => ({
        ...groupOrder,
        moveTo: groupOrder.moveTo ? { ...groupOrder.moveTo } : undefined,
      })),
    };
    const directiveHasSpatialReference = SPATIAL_DIRECTION_PATTERN.test(directive);

    if (
      parsedDirective.targetId &&
      !structuredDecision.targetId &&
      structuredDecision.intent === parsedDirective.intent
    ) {
      structuredDecision.targetId = parsedDirective.targetId;
    }

    if (
      parsedDirective.moveTo &&
      this.shouldApplyDirectiveMoveTo(
        structuredDecision,
        parsedDirective,
        directiveHasSpatialReference
      )
    ) {
      structuredDecision.moveTo = { ...parsedDirective.moveTo };
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
    if (!parsedDirective.moveTo) {
      return false;
    }

    if (decision.intent === parsedDirective.intent) {
      return directiveHasSpatialReference || !decision.moveTo;
    }

    return (
      isPositionalIntent(decision.intent) &&
      isPositionalIntent(parsedDirective.intent) &&
      (directiveHasSpatialReference || !decision.moveTo)
    );
  }

  private appendDirectiveTag(rationaleTag: string, suffix: string): string {
    return rationaleTag.includes(suffix) ? rationaleTag : `${rationaleTag}_${suffix}`;
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
        moveTo: groupOrder.moveTo ? { ...groupOrder.moveTo } : undefined,
      }));
    }

    const merged = new Map<string, GroupOrder>();
    for (const groupOrder of currentOrders) {
      merged.set(groupOrder.group, {
        ...groupOrder,
        moveTo: groupOrder.moveTo ? { ...groupOrder.moveTo } : undefined,
      });
    }

    for (const directiveOrder of directiveOrders) {
      const existing = merged.get(directiveOrder.group);
      if (!existing) {
        merged.set(directiveOrder.group, {
          ...directiveOrder,
          moveTo: directiveOrder.moveTo ? { ...directiveOrder.moveTo } : undefined,
        });
        continue;
      }

      merged.set(directiveOrder.group, {
        ...existing,
        targetId: existing.targetId ?? directiveOrder.targetId,
        moveTo: existing.moveTo
          ? { ...existing.moveTo }
          : directiveOrder.moveTo
            ? { ...directiveOrder.moveTo }
            : undefined,
      });
    }

    return [...merged.values()];
  }
}

interface QueuedDecisionResult {
  decision: HeroDecision;
  chatResponse?: string;
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
