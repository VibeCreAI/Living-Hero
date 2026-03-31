import { useEffect, useMemo, useRef, useState } from 'react';
import { EventBus } from '../../../../game/EventBus';
import {
  BattlePlanApprovalEvent,
  BattlePlanRequestEvent,
  BattleState,
  BattleSummaryData,
  HeroDecision,
  HeroState,
  HeroChatEvent,
  ReservedChainStep,
  UnitGroup,
} from '../../../../game/types';
import { CommunicationLog, CommunicationMessage } from './ChatPanel';
import { BattleSummary } from './BattleSummary';
import { LLMStatus } from './LLMStatus';
import { DecisionTimeline } from './DecisionTimeline';
import { SelectionPanel } from '../panels/SelectionPanel';
import { DebugPanel } from '../panels/DebugPanel';
import { PlayerChatComposer, PlayerChatSendPayload } from './PlayerChatComposer';

export function BattleHUD() {
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [activeHeroId, setActiveHeroId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [summaryData, setSummaryData] = useState<BattleSummaryData | null>(null);
  const [planningOverlayVisible, setPlanningOverlayVisible] = useState(false);
  const [plannerPrompt, setPlannerPrompt] = useState('');
  const messageIdRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const stateHandler = (state: BattleState) => {
      const stateSnapshot = structuredClone(state);

      if (sessionIdRef.current !== stateSnapshot.sessionId) {
        sessionIdRef.current = stateSnapshot.sessionId;
        setMessages([]);
        setSummaryData(null);
        setPlanningOverlayVisible(stateSnapshot.mode === 'battle');
        setPlannerPrompt('');
        messageIdRef.current = 0;
      }

      const inPlannerFlow =
        stateSnapshot.mode === 'battle' &&
        (stateSnapshot.phase === 'init' ||
          stateSnapshot.phase === 'planning' ||
          stateSnapshot.phase === 'ready');
      if (stateSnapshot.phase === 'planning' || stateSnapshot.phase === 'ready') {
        setPlanningOverlayVisible(true);
      } else if (!inPlannerFlow) {
        setPlanningOverlayVisible(false);
      }
      setBattleState(stateSnapshot);
      setActiveHeroId((current) => {
        if (current && stateSnapshot.heroes.some((hero) => hero.id === current)) {
          return current;
        }
        return stateSnapshot.heroes[0]?.id ?? null;
      });
    };

    const summaryHandler = (data: BattleSummaryData) => {
      setSummaryData(data);
    };

    const heroResponseHandler = (event: HeroChatEvent) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${messageIdRef.current++}`,
          sender: 'hero',
          speakerName: event.heroName,
          text: event.message,
        },
      ]);
    };

    const heroSelectionHandler = (hero: HeroState) => {
      setActiveHeroId(hero.id);
    };

    const directiveParsedHandler = (event: {
      heroId: string;
      heroName: string;
      directive: string;
      parsedIntent: string;
      parsedGroupOrders?: { group: string; intent: string }[];
    }) => {
      let text = `Parsed: ${event.parsedIntent.replace(/_/g, ' ')}`;
      if (event.parsedGroupOrders?.length) {
        const parts = event.parsedGroupOrders.map(
          (go) => `${formatGroupLabel(go.group)}: ${go.intent.replace(/_/g, ' ')}`
        );
        text = `Parsed: ${parts.join(' | ')}`;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${messageIdRef.current++}`,
          sender: 'system' as const,
          speakerName: 'System',
          text,
        },
      ]);
    };

    EventBus.on('battle-state-update', stateHandler);
    EventBus.on('hero-chat-response', heroResponseHandler);
    EventBus.on('hero-selected', heroSelectionHandler);
    EventBus.on('directive-parsed', directiveParsedHandler);
    EventBus.on('battle-summary', summaryHandler);

    return () => {
      EventBus.removeListener('battle-state-update', stateHandler);
      EventBus.removeListener('hero-chat-response', heroResponseHandler);
      EventBus.removeListener('hero-selected', heroSelectionHandler);
      EventBus.removeListener('directive-parsed', directiveParsedHandler);
      EventBus.removeListener('battle-summary', summaryHandler);
    };
  }, []);

  const activeHero = useMemo(() => {
    if (!battleState) {
      return undefined;
    }

    return battleState.heroes.find((hero) => hero.id === activeHeroId) ?? battleState.heroes[0];
  }, [activeHeroId, battleState]);

  const alliedAlive = battleState?.alliedUnits.filter((u) => u.state !== 'dead').length ?? 0;
  const enemyAlive = battleState?.enemyUnits.filter((u) => u.state !== 'dead').length ?? 0;
  const timeSec = battleState?.timeSec ?? 0;
  const isPlayground = battleState?.mode === 'playground';
  const isPlannerIdle = battleState?.mode === 'battle' && battleState.phase === 'init';
  const isPlanGenerating = battleState?.mode === 'battle' && battleState.phase === 'planning';
  const isPlanReady = battleState?.mode === 'battle' && battleState.phase === 'ready';
  const isPreBattleFlow = isPlannerIdle || isPlanGenerating || isPlanReady;
  const battleTitle =
    isPlayground
      ? 'PLAYGROUND'
      : battleState?.floorNumber
        ? `FLOOR ${battleState.floorNumber}`
        : 'BATTLE';
  const currentDecision = activeHero?.currentDecision;
  const currentDirective = activeHero?.currentDirective;
  const armyPlan = formatPlan(currentDecision);
  const intentLabel = formatIntentLabel(currentDecision);
  const heroPlan = formatGroupPlan(currentDecision, 'hero');
  const warriorPlan = formatGroupPlan(currentDecision, 'warriors');
  const archerPlan = formatGroupPlan(currentDecision, 'archers');
  const hasSplitPlan = Boolean(currentDecision?.groupOrders?.length);
  const openingStrategy = activeHero?.openingStrategy;

  useEffect(() => {
    if (
      openingStrategy &&
      (openingStrategy.status === 'planning' ||
        openingStrategy.status === 'ready' ||
        openingStrategy.status === 'error')
    ) {
      setPlannerPrompt(openingStrategy.promptText);
    }
  }, [openingStrategy]);

  const leavePlayground = () => {
    EventBus.emit('playground-exit-requested');
  };

  const generatePlan = () => {
    if (!activeHero?.id) {
      return;
    }

    const event: BattlePlanRequestEvent = {
      text: plannerPrompt.trim(),
      targetHeroIds: [activeHero.id],
    };
    EventBus.emit('battle-plan-requested', event);
  };

  const revisePlan = () => {
    if (!activeHero?.id) {
      return;
    }

    const event: BattlePlanApprovalEvent = {
      targetHeroIds: [activeHero.id],
    };
    EventBus.emit('battle-plan-revise-requested', event);
  };

  const approvePlan = () => {
    if (!activeHero?.id) {
      return;
    }

    const event: BattlePlanApprovalEvent = {
      targetHeroIds: [activeHero.id],
    };
    EventBus.emit('battle-plan-approved', event);
  };

  const handleSend = (payload: PlayerChatSendPayload) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${messageIdRef.current++}`,
        sender: 'player',
        speakerName: 'You',
        text: payload.displayText,
        recipientNames: payload.recipientNames,
      },
    ]);

    if (payload.event.targetHeroIds[0]) {
      setActiveHeroId(payload.event.targetHeroIds[0]);
    }

    EventBus.emit('player-chat-message', payload.event);
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: '"NeoDunggeunmoPro", monospace',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: '312px',
          padding: '10px',
          boxSizing: 'border-box',
          borderRadius: '0 10px 10px 0',
          border: '1px solid #3b2c18',
          backgroundColor: '#120d09d9',
          color: '#ddd2bc',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          overflow: 'hidden',
          pointerEvents: 'auto',
          boxShadow: '0 12px 28px rgba(0,0,0,0.32)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: isPlayground ? '#ffcc66' : '#ff6644', fontSize: '17px' }}>
            {battleTitle}
          </span>
          <LLMStatus />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {(battleState?.heroes ?? []).map((hero) => (
            <button
              key={hero.id}
              onClick={() => setActiveHeroId(hero.id)}
              style={{
                padding: '3px 8px',
                borderRadius: '999px',
                border: hero.id === activeHero?.id ? '1px solid #ffd700' : '1px solid #5a4727',
                backgroundColor: hero.id === activeHero?.id ? '#2a2110' : '#17120b',
                color: hero.id === activeHero?.id ? '#ffd700' : '#d4c4a1',
                cursor: 'pointer',
                fontFamily: '"NeoDunggeunmoPro", monospace',
                fontSize: '12px',
              }}
            >
              @{hero.name}
            </button>
          ))}
        </div>

        <div>
          <span style={{ color: '#4488ff' }}>Allies: {alliedAlive}</span>
          {' | '}
          <span style={{ color: isPlayground ? '#ffcc66' : '#ff4444' }}>
            {isPlayground ? 'Targets' : 'Enemies'}: {enemyAlive}
          </span>
          {' | '}
          <span>Time: {timeSec.toFixed(1)}s</span>
        </div>

        {isPlayground && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <span style={{ color: '#9ec7d8' }}>
              Click a target to inspect it, then send directives to your hero to test obedience and routing.
            </span>
            <button
              onClick={leavePlayground}
              style={{
                padding: '5px 8px',
                fontFamily: '"NeoDunggeunmoPro", monospace',
                fontSize: '14px',
                cursor: 'pointer',
                backgroundColor: '#2b1b12',
                color: '#ffcc66',
                border: '1px solid #8b5a2b',
                borderRadius: '4px',
              }}
            >
              Back To Overworld
            </button>
          </div>
        )}

        <div>
          <span style={{ color: '#ffd700' }}>Hero: </span>
          <span>{activeHero?.name ?? 'none'}</span>
        </div>

        <div>
          <span style={{ color: '#ffd700' }}>Intent: </span>
          <span>{intentLabel}</span>
          {currentDecision?.rationaleTag && (
            <span style={{ color: '#888', marginLeft: '6px' }}>({currentDecision.rationaleTag})</span>
          )}
        </div>

        <div>
          <span style={{ color: '#9ec7d8' }}>Directive: </span>
          <span>{currentDirective ? `"${currentDirective}"` : 'none'}</span>
        </div>

        {openingStrategy?.status === 'active' && (
          <div
            style={{
              padding: '6px 8px',
              border: '1px solid #3b3b3b',
              borderRadius: '6px',
              backgroundColor: '#141914',
            }}
          >
            <div style={{ color: '#8fc7ff', marginBottom: '4px', fontSize: '13px' }}>
              Opening Chain
            </div>
            <PlanRow
              label="Status"
              value={openingStrategy.breakable ? 'breakable' : 'armed'}
              color="#8fc7ff"
            />
            <PlanRow
              label="Step"
              value={formatOpeningStepLabel(openingStrategy.activeStepIndex)}
              color="#c8f08a"
            />
            <PlanRow
              label="Next"
              value={openingStrategy.nextTrigger ? formatTriggerLabel(openingStrategy.nextTrigger) : 'none'}
              color="#f0c871"
            />
            <div style={{ marginTop: '6px', color: '#cdbd97', fontSize: '12px', lineHeight: 1.4 }}>
              {openingStrategy.planSummary}
            </div>
          </div>
        )}

        <div
          style={{
            padding: '6px 8px',
            border: '1px solid #3b3b3b',
            borderRadius: '6px',
            backgroundColor: hasSplitPlan ? '#171b12' : '#141414',
          }}
        >
          <div style={{ color: '#9a9a9a', marginBottom: '4px', fontSize: '13px' }}>
            {hasSplitPlan ? 'Hero Plan' : 'Army Plan'}
          </div>
          <PlanRow label="Army" value={armyPlan} color="#ffd700" />
          <PlanRow label="Hero" value={heroPlan} color="#f3c86b" />
          <PlanRow label="Warriors" value={warriorPlan} color="#ff9d66" />
          <PlanRow label="Ranged" value={archerPlan} color="#8fc7ff" />
        </div>

        <DecisionTimeline activeHeroId={activeHero?.id ?? null} />
        <SelectionPanel />
        <DebugPanel activeHeroId={activeHero?.id ?? null} />

        <div
          style={{
            marginTop: 'auto',
            minHeight: 0,
            flex: '1 1 auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <CommunicationLog messages={messages} />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: '780px',
          width: '1024px',
          height: '168px',
          pointerEvents: 'auto',
        }}
      >
        <PlayerChatComposer
          heroes={battleState?.heroes ?? []}
          activeHeroId={activeHero?.id ?? null}
          onActiveHeroChange={setActiveHeroId}
          onSend={handleSend}
          disabled={Boolean(isPreBattleFlow)}
          disabledNote="Battle comms unlock after combat begins."
          placeholder="Available after battle begins..."
        />
      </div>

      {summaryData && <BattleSummary data={summaryData} messages={messages} />}

      {isPreBattleFlow && (
        <>
          {!planningOverlayVisible && (
            <div
              style={{
                position: 'absolute',
                left: '16px',
                top: '16px',
                pointerEvents: 'auto',
              }}
            >
              <button
                onClick={() => setPlanningOverlayVisible(true)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #8b5a2b',
                  backgroundColor: '#20150ddd',
                  color: '#ffd889',
                  cursor: 'pointer',
                  fontFamily: '"NeoDunggeunmoPro", monospace',
                  fontSize: '13px',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.28)',
                }}
              >
                Open Battle Planner
              </button>
            </div>
          )}

          {planningOverlayVisible && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '1024px',
                height: '768px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
              >
                <div
                  style={{
                    width: 'min(520px, calc(100% - 48px))',
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid #5b3f1f',
                    backgroundColor: '#120d09e8',
                    boxShadow: '0 16px 36px rgba(0,0,0,0.38)',
                    color: '#eadfc7',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    pointerEvents: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div>
                      <div style={{ color: '#ffd700', fontSize: '17px', marginBottom: '4px' }}>
                        Battle Planner
                      </div>
                      <div style={{ color: '#cdbd97', fontSize: '13px' }}>
                        Generate an opening strategy first, then approve it to start combat.
                      </div>
                    </div>
                    <button
                      onClick={() => setPlanningOverlayVisible(false)}
                      style={{
                        padding: '5px 9px',
                        borderRadius: '6px',
                        border: '1px solid #6c5630',
                        backgroundColor: '#22170f',
                        color: '#d7c08e',
                        cursor: 'pointer',
                        fontFamily: '"NeoDunggeunmoPro", monospace',
                        fontSize: '13px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Hide Panel
                    </button>
                  </div>

                  <div style={{ color: '#8fc7ff', fontSize: '13px' }}>
                    Active commander: @{activeHero?.name ?? 'none'}
                  </div>

                  {openingStrategy?.status === 'error' && (
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid #7a3f32',
                        backgroundColor: '#28110ddd',
                        color: '#ffb19d',
                        fontSize: '12px',
                        lineHeight: 1.4,
                      }}
                    >
                      {openingStrategy?.errorMessage ?? 'Unable to generate a strategy plan.'}
                    </div>
                  )}

                  {(isPlannerIdle || openingStrategy?.status === 'error') && (
                    <>
                      <textarea
                        value={plannerPrompt}
                        onChange={(event) => setPlannerPrompt(event.target.value)}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                        }}
                        onKeyUp={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        onFocus={(event) => {
                          event.stopPropagation();
                        }}
                        placeholder="Optional: hide behind bottom rocks to counter later, then when combat starts target the archers first."
                        rows={4}
                        style={{
                          width: '100%',
                          minHeight: '96px',
                          resize: 'none',
                          borderRadius: '6px',
                          border: '1px solid #3e311b',
                          backgroundColor: '#0b0907',
                          color: '#f4efe0',
                          padding: '10px 12px',
                          boxSizing: 'border-box',
                          fontFamily: '"NeoDunggeunmoPro", monospace',
                          fontSize: '14px',
                          lineHeight: 1.35,
                          outline: 'none',
                        }}
                      />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                        <div style={{ color: '#9f957e', fontSize: '12px' }}>
                          The prompt is optional. Blank prompts still generate a tactical opener.
                        </div>
                        <button
                          onClick={generatePlan}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '6px',
                            border: '1px solid #8b5a2b',
                            backgroundColor: '#ffd700',
                            color: '#000',
                            cursor: 'pointer',
                            fontFamily: '"NeoDunggeunmoPro", monospace',
                            fontSize: '14px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Generate Plan
                        </button>
                      </div>
                    </>
                  )}

                  {isPlanGenerating && (
                    <div
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        border: '1px solid #5b3f1f',
                        backgroundColor: '#17110ccc',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ color: '#ffd700', fontSize: '17px' }}>Planning Strategy...</div>
                      <div style={{ color: '#d7c79e', fontSize: '13px', lineHeight: 1.5 }}>
                        The commander is shaping the opening move and any reserved follow-up orders.
                      </div>
                      <div style={{ color: '#9f957e', fontSize: '12px' }}>
                        {plannerPrompt ? `Prompt: "${plannerPrompt}"` : 'Using a blank prompt for a default opener.'}
                      </div>
                    </div>
                  )}

                  {isPlanReady && openingStrategy?.status === 'ready' && (
                    <>
                      <div
                        style={{
                          padding: '10px',
                          borderRadius: '8px',
                          border: '1px solid #3b3b3b',
                          backgroundColor: '#17140f',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ color: '#ffd700', fontSize: '13px' }}>Opening Order</div>
                        <div style={{ color: '#f0e4c8', fontSize: '14px', lineHeight: 1.45 }}>
                          {openingStrategy.openingChatResponse}
                        </div>
                        <div style={{ color: '#cdbd97', fontSize: '12px', lineHeight: 1.45 }}>
                          {openingStrategy.planSummary}
                        </div>
                        <PlanRow
                          label="Open"
                          value={formatPlan(openingStrategy.openingDecision)}
                          color="#ffd700"
                        />
                        <PlanRow
                          label="Chain"
                          value={openingStrategy.reservedSteps.length > 0 ? `${openingStrategy.reservedSteps.length} follow-up step(s)` : 'none'}
                          color="#8fc7ff"
                        />
                      </div>

                      {openingStrategy.reservedSteps.length > 0 && (
                        <div
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            border: '1px solid #3b3b3b',
                            backgroundColor: '#141914',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ color: '#8fc7ff', fontSize: '13px' }}>Reserved Follow-Ups</div>
                          {openingStrategy.reservedSteps.map((step, index) => (
                            <div
                              key={`${step.trigger}-${index}`}
                              style={{
                                paddingTop: index === 0 ? 0 : '8px',
                                borderTop: index === 0 ? 'none' : '1px solid #243025',
                              }}
                            >
                              <div style={{ color: '#c8f08a', fontSize: '12px', marginBottom: '3px' }}>
                                Step {index + 2} on {formatTriggerLabel(step.trigger)}
                              </div>
                              <div style={{ color: '#e6dbc0', fontSize: '12px', marginBottom: '4px', lineHeight: 1.4 }}>
                                {step.summary}
                              </div>
                              <div style={{ color: '#9f957e', fontSize: '12px' }}>
                                {formatReservedStep(step)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                        <button
                          onClick={revisePlan}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '6px',
                            border: '1px solid #6c5630',
                            backgroundColor: '#22170f',
                            color: '#d7c08e',
                            cursor: 'pointer',
                            fontFamily: '"NeoDunggeunmoPro", monospace',
                            fontSize: '14px',
                          }}
                        >
                          Revise Plan
                        </button>
                        <button
                          onClick={approvePlan}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '6px',
                            border: '1px solid #8b5a2b',
                            backgroundColor: '#ffd700',
                            color: '#000',
                            cursor: 'pointer',
                            fontFamily: '"NeoDunggeunmoPro", monospace',
                            fontSize: '14px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Approve & Start
                        </button>
                      </div>
                    </>
                  )}
                </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlanRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
      <span style={{ minWidth: '56px', color }}>{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function formatGroupPlan(decision: HeroDecision | undefined, group: UnitGroup): string {
  if (!decision) {
    return 'none';
  }

  const groupOrder = decision.groupOrders?.find((candidate) => candidate.group === group);
  return groupOrder ? formatPlan(groupOrder) : 'default';
}

function formatIntentLabel(decision: HeroDecision | undefined): string {
  if (!decision) {
    return 'Awaiting orders...';
  }

  if (decision.groupOrderMode === 'explicit_only' && decision.groupOrders?.length) {
    return decision.groupOrders.some((candidate) => candidate.group === 'all')
      ? 'army order + scoped groups'
      : 'scoped group orders';
  }

  return decision.intent;
}

function formatOpeningStepLabel(activeStepIndex: number): string {
  return activeStepIndex <= 0 ? 'opening' : `follow-up ${activeStepIndex}`;
}

function formatTriggerLabel(trigger: ReservedChainStep['trigger']): string {
  return trigger === 'enemy_in_range' ? 'enemy in range' : 'combat started';
}

function formatReservedStep(step: ReservedChainStep): string {
  return `${formatPlan(step)} | "${step.chatResponse}"`;
}

function formatPlan(
  decision:
    | Pick<HeroDecision, 'intent' | 'targetId' | 'moveToTile' | 'groupOrders' | 'groupOrderMode'>
    | Pick<
        { group: UnitGroup; intent: HeroDecision['intent']; targetId?: string; moveToTile?: { col: number; row: number } },
        'group' | 'intent' | 'targetId' | 'moveToTile'
      >
    | undefined
): string {
  if (!decision) {
    return 'none';
  }

  if ('group' in decision && decision.group === 'all') {
    return formatPlan({
      intent: decision.intent,
      targetId: decision.targetId,
      moveToTile: decision.moveToTile,
    });
  }

  if (
    !('group' in decision) &&
    decision.groupOrderMode === 'explicit_only' &&
    decision.groupOrders?.length
  ) {
    const allGroupOrder = decision.groupOrders.find((candidate) => candidate.group === 'all');
    if (allGroupOrder) {
      return formatPlan(allGroupOrder);
    }
    return 'unchanged';
  }

  const parts = [decision.intent.replace(/_/g, ' ')];
  if (decision.targetId) {
    parts.push(`-> ${decision.targetId}`);
  }
  if (decision.moveToTile) {
    parts.push(`@ [${decision.moveToTile.col}, ${decision.moveToTile.row}]`);
  }

  return parts.join(' ');
}

function formatGroupLabel(group: string): string {
  return group === 'archers' ? 'ranged' : group;
}
