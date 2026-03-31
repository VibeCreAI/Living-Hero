import {
  GroupOrder,
  HeroDecision,
  HeroSummary,
  ReservedChainStep,
  EnemyVariantId,
  TileCoord,
  UnitFaction,
  UnitGroup,
  UnitRole,
  UnitState,
  BattleState,
} from '../types';
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
import { ObstacleSystem } from '../systems/Obstacles';

export class HeroScheduler {
  private decisionProvider: IHeroDecisionProvider;
  private ollamaBrain: OllamaHeroBrain | null;
  private intentExecutor: IntentExecutor;
  private battleGrid: BattleGrid | null = null;
  private obstacles: ObstacleSystem | null = null;
  private timers: Map<string, number> = new Map();
  private pendingHeroes: Set<string> = new Set();
  private requestVersions: Map<string, number> = new Map();
  private openingRequestVersions: Map<string, number> = new Map();
  private baseDecisions: Map<string, HeroDecision> = new Map();
  private queuedResults: Map<string, QueuedDecisionResult> = new Map();
  private reactiveLocks: Map<string, ReactiveDecisionLock> = new Map();
  private pendingDirectives: Map<string, string> = new Map();
  private activeChains: Map<string, ActiveChainState> = new Map();
  private terrainDescription: string | undefined;
  private vocabulary: BattleVocabulary = new BattleVocabulary();
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
    this.battleGrid = battleGrid;
    this.intentExecutor.setBattleGrid(battleGrid);
  }

  setObstacles(obstacles: ObstacleSystem): void {
    this.obstacles = obstacles;
  }

  initVocabulary(alliedUnits: UnitState[], enemyUnits: UnitState[]): void {
    this.vocabulary.assignNicknames(alliedUnits, enemyUnits);
    if (this.ollamaBrain) {
      this.ollamaBrain.vocabulary = this.vocabulary;
    }
  }

  setTerrainDescription(description: string): void {
    this.terrainDescription = description;
  }

  requestOpeningStrategy(
    promptText: string,
    targetHeroIds: string[],
    heroes: Hero[],
    battleState: BattleState
  ): void {
    const heroIds = this.resolveTargetHeroIds(targetHeroIds, heroes);
    const normalizedPrompt = promptText.trim();

    for (const heroId of heroIds) {
      const hero = heroes.find((candidate) => candidate.state.id === heroId);
      if (!hero) {
        continue;
      }

      this.baseDecisions.delete(heroId);
      this.queuedResults.delete(heroId);
      this.pendingDirectives.delete(heroId);
      this.reactiveLocks.delete(heroId);
      this.activeChains.delete(heroId);
      hero.state.currentDirective = undefined;
      hero.state.currentDecision = undefined;
      hero.state.openingStrategy = {
        status: 'planning',
        promptText: normalizedPrompt,
        planSummary: '',
        openingChatResponse: '',
        reservedSteps: [],
        activeStepIndex: 0,
        breakable: false,
      };

      if (!this.ollamaBrain) {
        hero.state.openingStrategy = {
          ...hero.state.openingStrategy,
          status: 'error',
          errorMessage: 'Commander is offline. Retry after the model reconnects.',
        };
        continue;
      }

      const requestVersion = (this.openingRequestVersions.get(heroId) ?? 0) + 1;
      this.openingRequestVersions.set(heroId, requestVersion);
      const summary = buildHeroSummary(hero.state, battleState);
      const parsedOpeningPrompt = normalizedPrompt
        ? interpretPlayerMessage(summary, normalizedPrompt, this.terrainDescription)
        : null;

      this.ollamaBrain
        .planOpeningStrategyAsync(summary, normalizedPrompt, this.terrainDescription)
        .then((result) => {
          if (this.openingRequestVersions.get(heroId) !== requestVersion) {
            return;
          }

          const structuredOpeningDecision = parsedOpeningPrompt
            ? this.mergeDirectiveDetails(
                normalizedPrompt,
                cloneDecision(result.openingDecision),
                parsedOpeningPrompt
              )
            : cloneDecision(result.openingDecision);

          hero.state.openingStrategy = {
            status: 'ready',
            promptText: normalizedPrompt,
            planSummary: result.planSummary,
            openingChatResponse: result.chatResponse,
            openingDecision: structuredOpeningDecision,
            reservedSteps: result.reservedSteps.map(cloneReservedStep),
            activeStepIndex: 0,
            nextTrigger: result.reservedSteps[0]?.trigger,
            breakable: false,
          };
        })
        .catch(() => {
          if (this.openingRequestVersions.get(heroId) !== requestVersion) {
            return;
          }

          hero.state.openingStrategy = {
            status: 'error',
            promptText: normalizedPrompt,
            planSummary: '',
            openingChatResponse: '',
            reservedSteps: [],
            activeStepIndex: 0,
            breakable: false,
            errorMessage: 'Unable to generate a strategy plan. Retry when the commander is ready.',
          };
        });
    }
  }

  clearOpeningStrategyDrafts(targetHeroIds: string[], heroes: Hero[]): void {
    for (const heroId of this.resolveTargetHeroIds(targetHeroIds, heroes)) {
      const hero = heroes.find((candidate) => candidate.state.id === heroId);
      if (!hero) {
        continue;
      }

      const strategy = hero.state.openingStrategy;
      if (!strategy || strategy.status === 'active' || strategy.status === 'broken') {
        continue;
      }

      hero.state.openingStrategy = undefined;
    }
  }

  approveOpeningStrategies(
    targetHeroIds: string[],
    heroes: Hero[],
    battleState: BattleState,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): boolean {
    let approved = false;

    for (const heroId of this.resolveTargetHeroIds(targetHeroIds, heroes)) {
      const hero = heroes.find((candidate) => candidate.state.id === heroId);
      const openingStrategy = hero?.state.openingStrategy;
      if (
        !hero ||
        !openingStrategy ||
        openingStrategy.status !== 'ready' ||
        !openingStrategy.openingDecision
      ) {
        continue;
      }

      const openingDecision = cloneDecision(openingStrategy.openingDecision);
      const reservedSteps = openingStrategy.reservedSteps.map(cloneReservedStep);
      const openingDecisionProfile = this.describeDecisionTargetProfile(
        openingDecision,
        alliedUnits,
        enemyUnits
      );
      const liveOpeningDecision = this.resolveDynamicChainDecision(
        openingDecision,
        openingDecisionProfile,
        hero,
        alliedUnits,
        enemyUnits
      );
      const reservedStepProfiles = reservedSteps.map((reservedStep) =>
        this.describeDecisionTargetProfile(reservedStep, alliedUnits, enemyUnits)
      );
      this.baseDecisions.set(heroId, cloneDecision(liveOpeningDecision));
      hero.state.currentDirective = undefined;
      hero.setDecision(cloneDecision(liveOpeningDecision));
      if (reservedSteps.length > 0) {
        const chainState: ActiveChainState = {
          promptText: openingStrategy.promptText,
          planSummary: openingStrategy.planSummary,
          openingChatResponse: openingStrategy.openingChatResponse,
          openingDecision: cloneDecision(openingDecision),
          reservedSteps,
          currentStepIndex: 0,
          openingDecisionProfile,
          reservedStepProfiles,
          currentDecisionProfile: openingDecisionProfile,
          currentDecision: cloneDecision(liveOpeningDecision),
          activatedAtSec: battleState.timeSec,
          approvedAtSec: battleState.timeSec,
          alliedUnitIdsAtApproval: new Set(
            this.getAssignedUnits(heroId, alliedUnits)
              .filter((unit) => unit.isAlive())
              .map((unit) => unit.id)
          ),
          currentTargetRoles: this.resolveDecisionTargetRolesFromProfile(openingDecisionProfile),
          lastNarratedMessage: normalizeChatMessage(openingStrategy.openingChatResponse),
          lastNarratedAtSec: battleState.timeSec,
        };

        this.activeChains.set(heroId, chainState);
        hero.state.openingStrategy = {
          status: 'active',
          promptText: openingStrategy.promptText,
          planSummary: openingStrategy.planSummary,
          openingChatResponse: openingStrategy.openingChatResponse,
          openingDecision: cloneDecision(openingDecision),
          reservedSteps: reservedSteps.map(cloneReservedStep),
          activeStepIndex: 0,
          nextTrigger: reservedSteps[0]?.trigger,
          breakable: false,
        };
      } else {
        hero.state.openingStrategy = undefined;
      }

      this.intentExecutor.execute(hero, liveOpeningDecision, alliedUnits, enemyUnits);
      if (openingStrategy.openingChatResponse.trim()) {
        this.emitHeroChat(hero, openingStrategy.openingChatResponse);
      }

      approved = true;
    }

    return approved;
  }

  hasReadyOpeningStrategies(heroes: Hero[], targetHeroIds: string[]): boolean {
    const heroIds = this.resolveTargetHeroIds(targetHeroIds, heroes);
    return heroIds.length > 0 && heroIds.every((heroId) => {
      const hero = heroes.find((candidate) => candidate.state.id === heroId);
      return hero?.state.openingStrategy?.status === 'ready';
    });
  }

  hasOpeningStrategyErrors(heroes: Hero[], targetHeroIds: string[]): boolean {
    return this.resolveTargetHeroIds(targetHeroIds, heroes).some((heroId) => {
      const hero = heroes.find((candidate) => candidate.state.id === heroId);
      return hero?.state.openingStrategy?.status === 'error';
    });
  }

  processChainTriggers(
    heroes: Hero[],
    battleState: BattleState,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): void {
    for (const hero of heroes) {
      const heroId = hero.state.id;
      const activeChain = this.activeChains.get(heroId);
      if (!activeChain) {
        continue;
      }

      if (this.isChainExhausted(activeChain)) {
        this.completeActiveChain(hero);
        continue;
      }

      this.refreshActiveChainDecision(hero, activeChain, alliedUnits, enemyUnits);
      const nextReservedStep = activeChain.reservedSteps[activeChain.currentStepIndex];
      const summary = buildHeroSummary(hero.state, battleState);
      const breakable = this.canBreakChain(heroId, summary, alliedUnits, enemyUnits, activeChain);
      this.syncActiveChainState(hero, activeChain, breakable);

      if (!nextReservedStep) {
        continue;
      }

      const triggerFired =
        nextReservedStep.trigger === 'enemy_in_range'
          ? this.hasEnemyInRange(heroId, alliedUnits, enemyUnits)
          : this.hasCombatStarted(heroId, alliedUnits, activeChain.activatedAtSec);

      if (!triggerFired) {
        continue;
      }

      const stepProfile =
        activeChain.reservedStepProfiles[activeChain.currentStepIndex]
        ?? this.describeDecisionTargetProfile(nextReservedStep, alliedUnits, enemyUnits);
      activeChain.currentStepIndex += 1;
      activeChain.currentDecisionProfile = stepProfile;
      activeChain.currentDecision = this.resolveDynamicChainDecision(
        decisionFromStep(nextReservedStep),
        stepProfile,
        hero,
        alliedUnits,
        enemyUnits
      );
      activeChain.currentTargetRoles = this.resolveDecisionTargetRolesFromProfile(stepProfile);
      activeChain.activatedAtSec = battleState.timeSec;

      this.baseDecisions.set(heroId, cloneDecision(activeChain.currentDecision));
      hero.setDecision(cloneDecision(activeChain.currentDecision));
      this.intentExecutor.execute(hero, activeChain.currentDecision, alliedUnits, enemyUnits);
      this.syncActiveChainState(
        hero,
        activeChain,
        this.canBreakChain(heroId, summary, alliedUnits, enemyUnits, activeChain)
      );
      this.recordChainNarration(activeChain, nextReservedStep.chatResponse, battleState.timeSec);
      this.emitHeroChat(hero, nextReservedStep.chatResponse);

      if (this.isChainExhausted(activeChain)) {
        this.completeActiveChain(hero);
      }
    }
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
        this.clearActiveChain(hero, false);
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
      const currentChain = this.activeChains.get(heroId);
      if (currentChain && this.isChainExhausted(currentChain)) {
        this.completeActiveChain(hero);
      }
      const activeChain = this.activeChains.get(heroId);

      if (activeChain) {
        this.refreshActiveChainDecision(hero, activeChain, alliedUnits, enemyUnits);
        const breakable = this.canBreakChain(heroId, summary, alliedUnits, enemyUnits, activeChain);
        this.syncActiveChainState(hero, activeChain, breakable);
      }

      if (incomingDirective && this.ollamaBrain && parsedDirective) {
        EventBus.emit('directive-parsed', {
          heroId,
          heroName: hero.state.name,
          directive: incomingDirective,
          parsedIntent: parsedDirective.intent,
          parsedGroupOrders: parsedDirective.groupOrders,
        });

        const interimDecision = this.applyDirectiveStructure(summary, parsedDirective, parsedDirective);
        this.baseDecisions.set(heroId, interimDecision);
        hero.setDecision(interimDecision);
        this.intentExecutor.execute(hero, interimDecision, alliedUnits, enemyUnits);
      }

      let queuedChatResponse: string | undefined;

      const queuedResult = this.queuedResults.get(heroId);
      if (queuedResult) {
        this.queuedResults.delete(heroId);
        if (activeChain) {
          if (
            queuedResult.source === 'llm' &&
            queuedResult.chainControl === 'break' &&
            this.canBreakChain(heroId, summary, alliedUnits, enemyUnits, activeChain)
          ) {
            this.clearActiveChain(hero, true);
            this.baseDecisions.set(heroId, cloneDecision(queuedResult.decision));
            queuedChatResponse = queuedResult.chatResponse;
          } else if (
            queuedResult.source === 'llm' &&
            queuedResult.chainControl !== 'break' &&
            this.shouldEmitChainStatusChat(activeChain, queuedResult.chatResponse, battleState.timeSec)
          ) {
            queuedChatResponse = queuedResult.chatResponse?.trim();
            if (queuedChatResponse) {
              this.recordChainNarration(activeChain, queuedChatResponse, battleState.timeSec);
            }
          }
          this.timers.set(heroId, 0);
        } else {
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
      }

      const latestChain = this.activeChains.get(heroId);
      const baseDecision = latestChain?.currentDecision ?? this.baseDecisions.get(heroId);
      if (baseDecision) {
        const activeDecision = latestChain
          ? cloneDecision(baseDecision)
          : this.shouldPinParsedDirective(parsedDirective)
            ? this.pinDirectiveDecision(baseDecision, parsedDirective)
            : this.stabilizeDecision(
                heroId,
                summary,
                adaptReactiveDecision(summary, baseDecision)
              );

        hero.setDecision(activeDecision);
        this.intentExecutor.execute(hero, activeDecision, alliedUnits, enemyUnits);
        if (queuedChatResponse) {
          this.emitHeroChat(hero, queuedChatResponse);
        }
      }

      if (this.pendingHeroes.has(heroId)) {
        if (directiveConsumed) {
          this.pendingDirectives.delete(heroId);
        }
        continue;
      }

      const elapsed = (this.timers.get(heroId) ?? 0) + dt;
      const recheckInterval = baseDecision?.recheckInSec ?? 0;
      const eventTriggered = this.checkEventTriggers(heroId, summary);

      if (!incomingDirective && !eventTriggered && elapsed < recheckInterval) {
        this.timers.set(heroId, elapsed);
        if (directiveConsumed) {
          this.pendingDirectives.delete(heroId);
        }
        continue;
      }

      if (this.ollamaBrain) {
        this.pendingHeroes.add(heroId);
        const directive = latestChain ? undefined : activeDirective;
        directiveConsumed = !incomingDirective ? directiveConsumed : true;
        const requestVersion = (this.requestVersions.get(heroId) ?? 0) + 1;
        this.requestVersions.set(heroId, requestVersion);
        const announceDirectiveInterpretation = Boolean(incomingDirective && !parsedDirective && !latestChain);

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
              chainControl: result.chainControl,
              source: result.source,
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
            this.queuedResults.set(heroId, {
              decision: fallback,
              chatResponse: this.buildFallbackAck(fallback),
              source: 'fallback',
            });
          })
          .finally(() => {
            if (this.requestVersions.get(heroId) !== requestVersion) {
              return;
            }

            this.pendingHeroes.delete(heroId);
            this.timers.set(heroId, 0);
          });
      } else if (!latestChain) {
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
          EventBus.emit('directive-parsed', {
            heroId,
            heroName: hero.state.name,
            directive: incomingDirective,
            parsedIntent: decision.intent,
            parsedGroupOrders: decision.groupOrders,
          });
        }
        if (incomingDirective) {
          this.emitHeroChat(hero, this.buildFallbackAck(activeDecision));
        }
        this.timers.set(heroId, 0);
      }

      if (directiveConsumed) {
        this.pendingDirectives.delete(heroId);
      }
    }
  }

  setPlayerDirective(directive: string, targetHeroIds: string[], heroes?: Hero[]): void {
    for (const heroId of targetHeroIds) {
      this.pendingDirectives.set(heroId, directive);
      this.timers.set(heroId, Infinity);
      if (heroes) {
        const hero = heroes.find((candidate) => candidate.state.id === heroId);
        if (hero) {
          this.clearActiveChain(hero, false);
        }
      }
    }
  }

  private resolveTargetHeroIds(targetHeroIds: string[], heroes: Hero[]): string[] {
    if (targetHeroIds.length > 0) {
      return targetHeroIds;
    }
    return heroes.map((hero) => hero.state.id);
  }

  private emitHeroChat(hero: Hero, message: string): void {
    if (!message.trim()) {
      return;
    }

    hero.setSpeech(message);
    EventBus.emit('hero-chat-response', {
      heroId: hero.state.id,
      heroName: hero.state.name,
      message,
    });
  }

  private clearActiveChain(hero: Hero, markBroken: boolean): void {
    const activeChain = this.activeChains.get(hero.state.id);
    if (!activeChain) {
      if (!markBroken) {
        hero.state.openingStrategy = undefined;
      }
      return;
    }

    this.activeChains.delete(hero.state.id);
    if (markBroken) {
      hero.state.openingStrategy = {
        status: 'broken',
        promptText: activeChain.promptText,
        planSummary: activeChain.planSummary,
        openingChatResponse: activeChain.openingChatResponse,
        openingDecision: cloneDecision(activeChain.openingDecision),
        reservedSteps: activeChain.reservedSteps.map(cloneReservedStep),
        activeStepIndex: activeChain.currentStepIndex,
        nextTrigger: undefined,
        breakable: false,
      };
      return;
    }

    hero.state.openingStrategy = undefined;
  }

  private completeActiveChain(hero: Hero): void {
    this.activeChains.delete(hero.state.id);
    hero.state.openingStrategy = undefined;
  }

  private syncActiveChainState(
    hero: Hero,
    activeChain: ActiveChainState,
    breakable: boolean
  ): void {
    hero.state.openingStrategy = {
      status: 'active',
      promptText: activeChain.promptText,
      planSummary: activeChain.planSummary,
      openingChatResponse: activeChain.openingChatResponse,
      openingDecision: cloneDecision(activeChain.openingDecision),
      reservedSteps: activeChain.reservedSteps.map(cloneReservedStep),
      activeStepIndex: activeChain.currentStepIndex,
      nextTrigger: activeChain.reservedSteps[activeChain.currentStepIndex]?.trigger,
      breakable,
    };
  }

  private shouldEmitChainStatusChat(
    activeChain: ActiveChainState,
    message: string | undefined,
    timeSec: number
  ): boolean {
    const normalized = normalizeChatMessage(message);
    if (!normalized) {
      return false;
    }

    if (!activeChain.lastNarratedMessage) {
      return true;
    }

    if (normalized !== activeChain.lastNarratedMessage) {
      return true;
    }

    return timeSec - activeChain.lastNarratedAtSec >= CHAIN_STATUS_CHAT_REPEAT_SEC;
  }

  private recordChainNarration(
    activeChain: ActiveChainState,
    message: string | undefined,
    timeSec: number
  ): void {
    const normalized = normalizeChatMessage(message);
    if (!normalized) {
      return;
    }

    activeChain.lastNarratedMessage = normalized;
    activeChain.lastNarratedAtSec = timeSec;
  }

  private hasEnemyInRange(heroId: string, alliedUnits: Unit[], enemyUnits: Unit[]): boolean {
    const assignedUnits = this.getAssignedUnits(heroId, alliedUnits).filter((unit) => unit.isAlive());
    const aliveEnemies = enemyUnits.filter((unit) => unit.isAlive());

    for (const ally of assignedUnits) {
      for (const enemy of aliveEnemies) {
        if (!this.canImmediatelyAttack(ally, enemy)) {
          continue;
        }
        return true;
      }
    }

    return false;
  }

  private hasCombatStarted(heroId: string, alliedUnits: Unit[], activatedAtSec: number): boolean {
    return this.getAssignedUnits(heroId, alliedUnits).some((unit) => {
      if (!unit.isAlive()) {
        return false;
      }

      return (
        (unit.state.lastAttackTimeSec ?? -1) > activatedAtSec ||
        (unit.state.lastDamageTakenTimeSec ?? -1) > activatedAtSec
      );
    });
  }

  private canImmediatelyAttack(attacker: Unit, target: Unit): boolean {
    const rangeTiles = this.attackRangeTiles(attacker);
    const inRange = this.battleGrid
      ? this.battleGrid.isWithinAttackRange(attacker.state.tile, target.state.tile, rangeTiles)
      : Math.hypot(
          attacker.state.tile.col - target.state.tile.col,
          attacker.state.tile.row - target.state.tile.row
        ) <= rangeTiles;
    if (!inRange) {
      return false;
    }

    if (this.obstacles) {
      return this.obstacles.hasLineOfSight(attacker.state.position, target.state.position, 6);
    }

    return true;
  }

  private attackRangeTiles(unit: Unit): number {
    if (!this.battleGrid) {
      return 1;
    }
    return this.battleGrid.pixelsToAttackRangeTiles(unit.state.attackRange);
  }

  private getAssignedUnits(heroId: string, alliedUnits: Unit[]): Unit[] {
    return alliedUnits.filter((unit) => unit.state.assignedHeroId === heroId);
  }

  private canBreakChain(
    heroId: string,
    summary: HeroSummary,
    alliedUnits: Unit[],
    enemyUnits: Unit[],
    activeChain: ActiveChainState
  ): boolean {
    const heroUnit = summary.heroUnit;
    if (heroUnit && heroUnit.maxHp > 0 && heroUnit.hp / heroUnit.maxHp <= 0.5) {
      return true;
    }

    const aliveAssignedIds = new Set(
      this.getAssignedUnits(heroId, alliedUnits)
        .filter((unit) => unit.isAlive())
        .map((unit) => unit.id)
    );
    for (const unitId of activeChain.alliedUnitIdsAtApproval) {
      if (!aliveAssignedIds.has(unitId)) {
        return true;
      }
    }

    if (this.isChainTargetUnavailable(activeChain.currentDecisionProfile, alliedUnits, enemyUnits)) {
      return true;
    }

    return this.hasStalledAssignedUnit(heroId, alliedUnits);
  }

  private isChainTargetUnavailable(
    profile: DecisionTargetProfile,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): boolean {
    const targetProfiles = [
      profile.target,
      ...(profile.groupTargets ? Object.values(profile.groupTargets) : []),
    ].filter((candidate): candidate is ChainTargetProfile => Boolean(candidate?.hasTarget));

    if (targetProfiles.length === 0) {
      return false;
    }

    return targetProfiles.every((targetProfile) =>
      !this.findStrictProfileMatch(targetProfile, alliedUnits, enemyUnits)
    );
  }

  private hasStalledAssignedUnit(heroId: string, alliedUnits: Unit[]): boolean {
    return this.getAssignedUnits(heroId, alliedUnits).some((unit) => {
      if (!unit.isAlive()) {
        return false;
      }

      const waitTimeSec = unit.state.navigationDebug?.waitTimeSec ?? 0;
      if (waitTimeSec < 2.5) {
        return false;
      }

      const holdReason = unit.state.navigationDebug?.holdReason ?? '';
      return [
        'waiting_for_path',
        'reservation_blocked',
        'waiting_to_preserve_order_progress',
        'blocked_backtrack',
      ].includes(holdReason);
    });
  }

  private resolveDecisionTargetRolesFromProfile(profile: DecisionTargetProfile): UnitRole[] {
    const roles = new Set<UnitRole>();

    for (const targetProfile of [
      profile.target,
      ...(profile.groupTargets ? Object.values(profile.groupTargets) : []),
    ]) {
      if (targetProfile?.role) {
        roles.add(targetProfile.role);
      }
    }

    return [...roles];
  }

  private isChainExhausted(activeChain: ActiveChainState): boolean {
    return activeChain.currentStepIndex >= activeChain.reservedSteps.length;
  }

  private refreshActiveChainDecision(
    hero: Hero,
    activeChain: ActiveChainState,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): void {
    const resolvedDecision = this.resolveDynamicChainDecision(
      activeChain.currentDecision,
      activeChain.currentDecisionProfile,
      hero,
      alliedUnits,
      enemyUnits
    );
    activeChain.currentDecision = resolvedDecision;
    this.baseDecisions.set(hero.state.id, cloneDecision(resolvedDecision));
  }

  private describeDecisionTargetProfile(
    decision: HeroDecision,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): DecisionTargetProfile {
    const groupTargets = decision.groupOrders?.reduce<Partial<Record<UnitGroup, ChainTargetProfile>>>(
      (profiles, groupOrder) => {
        const targetProfile = this.describeUnitTargetProfile(
          groupOrder.targetId,
          alliedUnits,
          enemyUnits
        );
        if (targetProfile) {
          profiles[groupOrder.group] = targetProfile;
        }
        return profiles;
      },
      {}
    );

    return {
      target: this.describeUnitTargetProfile(decision.targetId, alliedUnits, enemyUnits),
      groupTargets:
        groupTargets && Object.keys(groupTargets).length > 0
          ? groupTargets
          : undefined,
    };
  }

  private describeUnitTargetProfile(
    targetId: string | undefined,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): ChainTargetProfile | undefined {
    if (!targetId) {
      return undefined;
    }

    const targetUnit = this.findUnitById(targetId, alliedUnits, enemyUnits);
    if (!targetUnit) {
      return { hasTarget: true };
    }

    return {
      hasTarget: true,
      faction: targetUnit.state.faction,
      role: targetUnit.state.role,
      variantId: targetUnit.state.variantId,
      displayNameStem: normalizeDisplayNameStem(targetUnit.state.displayName),
    };
  }

  private resolveDynamicChainDecision(
    decision: HeroDecision,
    profile: DecisionTargetProfile,
    hero: Hero,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): HeroDecision {
    const resolvedDecision = cloneDecision(decision);
    const topLevelAnchor = resolvedDecision.moveToTile ?? hero.state.tile;
    const resolvedTopLevelTarget = this.resolveDynamicTarget(
      resolvedDecision.targetId,
      profile.target,
      topLevelAnchor,
      alliedUnits,
      enemyUnits
    );

    if (resolvedTopLevelTarget) {
      resolvedDecision.targetId = resolvedTopLevelTarget.id;
      if (resolvedDecision.intent === 'focus_enemy') {
        resolvedDecision.moveToTile = { ...resolvedTopLevelTarget.state.tile };
      }
    }

    if (resolvedDecision.groupOrders?.length) {
      resolvedDecision.groupOrders = resolvedDecision.groupOrders.map((groupOrder) => {
        const groupAnchor =
          groupOrder.moveToTile
          ?? resolvedDecision.moveToTile
          ?? hero.state.tile;
        const resolvedGroupTarget = this.resolveDynamicTarget(
          groupOrder.targetId,
          profile.groupTargets?.[groupOrder.group],
          groupAnchor,
          alliedUnits,
          enemyUnits
        );
        if (!resolvedGroupTarget) {
          return groupOrder;
        }

        return {
          ...groupOrder,
          targetId: resolvedGroupTarget.id,
          moveToTile:
            groupOrder.intent === 'focus_enemy'
              ? { ...resolvedGroupTarget.state.tile }
              : groupOrder.moveToTile
                ? { ...groupOrder.moveToTile }
                : undefined,
        };
      });
    }

    return resolvedDecision;
  }

  private resolveDynamicTarget(
    targetId: string | undefined,
    profile: ChainTargetProfile | undefined,
    anchorTile: TileCoord,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): Unit | undefined {
    const exactTarget = targetId ? this.findUnitById(targetId, alliedUnits, enemyUnits) : undefined;
    if (exactTarget?.isAlive()) {
      return exactTarget;
    }

    if (!profile?.hasTarget) {
      return undefined;
    }

    const candidates = this.getProfileCandidates(profile, alliedUnits, enemyUnits);
    if (candidates.length === 0) {
      return undefined;
    }

    if (profile.variantId) {
      const variantMatch = this.findNearestUnitToTile(
        anchorTile,
        candidates.filter((candidate) => candidate.state.variantId === profile.variantId)
      );
      if (variantMatch) {
        return variantMatch;
      }
    }

    if (profile.displayNameStem) {
      const nameMatch = this.findNearestUnitToTile(
        anchorTile,
        candidates.filter(
          (candidate) =>
            normalizeDisplayNameStem(candidate.state.displayName) === profile.displayNameStem
        )
      );
      if (nameMatch) {
        return nameMatch;
      }
    }

    if (profile.role) {
      const roleMatch = this.findNearestUnitToTile(
        anchorTile,
        candidates.filter((candidate) => candidate.state.role === profile.role)
      );
      if (roleMatch) {
        return roleMatch;
      }
    }

    return this.findNearestUnitToTile(anchorTile, candidates);
  }

  private findStrictProfileMatch(
    profile: ChainTargetProfile,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): Unit | undefined {
    const candidates = this.getProfileCandidates(profile, alliedUnits, enemyUnits);
    if (candidates.length === 0) {
      return undefined;
    }

    if (profile.variantId) {
      const variantMatch = candidates.find((candidate) => candidate.state.variantId === profile.variantId);
      if (variantMatch) {
        return variantMatch;
      }
    }

    if (profile.displayNameStem) {
      const nameMatch = candidates.find(
        (candidate) =>
          normalizeDisplayNameStem(candidate.state.displayName) === profile.displayNameStem
      );
      if (nameMatch) {
        return nameMatch;
      }
    }

    if (profile.role) {
      return candidates.find((candidate) => candidate.state.role === profile.role);
    }

    return undefined;
  }

  private getProfileCandidates(
    profile: ChainTargetProfile,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): Unit[] {
    const aliveAllies = alliedUnits.filter((unit) => unit.isAlive());
    const aliveEnemies = enemyUnits.filter((unit) => unit.isAlive());

    switch (profile.faction) {
      case 'allied':
        return aliveAllies;
      case 'enemy':
        return aliveEnemies;
      default:
        return [...aliveAllies, ...aliveEnemies];
    }
  }

  private findUnitById(
    unitId: string,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): Unit | undefined {
    return [...alliedUnits, ...enemyUnits].find((candidate) => candidate.id === unitId);
  }

  private findNearestUnitToTile(anchorTile: TileCoord, units: Unit[]): Unit | undefined {
    if (units.length === 0) {
      return undefined;
    }

    if (!this.battleGrid) {
      return units.reduce<Unit | undefined>((nearest, candidate) => {
        if (!nearest) {
          return candidate;
        }

        const candidateDistance = Math.hypot(
          candidate.state.tile.col - anchorTile.col,
          candidate.state.tile.row - anchorTile.row
        );
        const nearestDistance = Math.hypot(
          nearest.state.tile.col - anchorTile.col,
          nearest.state.tile.row - anchorTile.row
        );
        return candidateDistance < nearestDistance ? candidate : nearest;
      }, undefined);
    }

    return units.reduce<Unit | undefined>((nearest, candidate) => {
      if (!nearest) {
        return candidate;
      }

      const candidateDistance = this.battleGrid!.distance(anchorTile, candidate.state.tile);
      const nearestDistance = this.battleGrid!.distance(anchorTile, nearest.state.tile);
      return candidateDistance < nearestDistance ? candidate : nearest;
    }, undefined);
  }

  private checkEventTriggers(heroId: string, summary: HeroSummary): boolean {
    const aliveEnemies = summary.nearbyEnemies.filter((unit) => unit.state !== 'dead');
    const aliveAllies = summary.nearbyAllies.filter((unit) => unit.state !== 'dead');

    const prevEnemyCount = this.lastEnemyCount.get(heroId) ?? aliveEnemies.length;
    this.lastEnemyCount.set(heroId, aliveEnemies.length);
    if (aliveEnemies.length < prevEnemyCount) {
      return true;
    }

    const minAllyHpPct = aliveAllies.length > 0
      ? Math.min(...aliveAllies.map((unit) => unit.hp / unit.maxHp))
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
      const parts = decision.groupOrders.map((groupOrder) => {
        const intentLabel = groupOrder.intent
          .replace(/_/g, ' ')
          .replace(' to point', '')
          .replace(' position', '');
        return `${groupOrder.group}: ${intentLabel}`;
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

  private getLastAlliedHitAge(summary: HeroSummary, attackerId: string): number | undefined {
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

interface ActiveChainState {
  promptText: string;
  planSummary: string;
  openingChatResponse: string;
  openingDecision: HeroDecision;
  reservedSteps: ReservedChainStep[];
  openingDecisionProfile: DecisionTargetProfile;
  reservedStepProfiles: DecisionTargetProfile[];
  currentStepIndex: number;
  currentDecisionProfile: DecisionTargetProfile;
  currentDecision: HeroDecision;
  activatedAtSec: number;
  approvedAtSec: number;
  alliedUnitIdsAtApproval: Set<string>;
  currentTargetRoles: UnitRole[];
  lastNarratedMessage?: string;
  lastNarratedAtSec: number;
}

interface QueuedDecisionResult {
  decision: HeroDecision;
  chatResponse?: string;
  playerOrderInterpretation?: HeroDecision;
  announceDirectiveInterpretation?: boolean;
  chainControl?: 'keep' | 'break';
  source?: 'llm' | 'fallback';
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

interface ChainTargetProfile {
  hasTarget: boolean;
  faction?: UnitFaction;
  role?: UnitRole;
  variantId?: EnemyVariantId;
  displayNameStem?: string;
}

interface DecisionTargetProfile {
  target?: ChainTargetProfile;
  groupTargets?: Partial<Record<UnitGroup, ChainTargetProfile>>;
}

const REACTIVE_LOCK_SEC = 1.25;
const REACTIVE_RELEASE_GRACE_SEC = 1.75;
const CHAIN_STATUS_CHAT_REPEAT_SEC = 6;
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

function cloneDecision(decision: HeroDecision): HeroDecision {
  return {
    ...decision,
    moveToTile: decision.moveToTile ? { ...decision.moveToTile } : undefined,
    groupOrders: decision.groupOrders?.map((groupOrder) => ({
      ...groupOrder,
      moveToTile: groupOrder.moveToTile ? { ...groupOrder.moveToTile } : undefined,
    })),
  };
}

function cloneReservedStep(step: ReservedChainStep): ReservedChainStep {
  return {
    ...cloneDecision(step),
    trigger: step.trigger,
    chatResponse: step.chatResponse,
    summary: step.summary,
  };
}

function normalizeChatMessage(message: string | undefined): string | undefined {
  const normalized = message?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function normalizeDisplayNameStem(displayName: string | undefined): string | undefined {
  const normalized = displayName
    ?.trim()
    .toLowerCase()
    .replace(/\s+\d+$/, '')
    .replace(/\s+/g, ' ');
  return normalized ? normalized : undefined;
}

function decisionFromStep(step: ReservedChainStep): HeroDecision {
  return {
    intent: step.intent,
    targetId: step.targetId,
    moveToTile: step.moveToTile ? { ...step.moveToTile } : undefined,
    skillId: step.skillId,
    groupOrders: step.groupOrders?.map((groupOrder) => ({
      ...groupOrder,
      moveToTile: groupOrder.moveToTile ? { ...groupOrder.moveToTile } : undefined,
    })),
    groupOrderMode: step.groupOrderMode,
    priority: step.priority,
    rationaleTag: step.rationaleTag,
    recheckInSec: step.recheckInSec,
  };
}
