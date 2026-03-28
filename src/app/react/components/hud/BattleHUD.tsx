import { useEffect, useMemo, useRef, useState } from 'react';
import { EventBus } from '../../../../game/EventBus';
import { BattleState, HeroDecision, HeroState, HeroChatEvent, UnitGroup } from '../../../../game/types';
import { CommunicationLog, CommunicationMessage } from './ChatPanel';
import { LLMStatus } from './LLMStatus';
import { DecisionTimeline } from './DecisionTimeline';
import { SelectionPanel } from '../panels/SelectionPanel';
import { DebugPanel } from '../panels/DebugPanel';
import { PlayerChatComposer, PlayerChatSendPayload } from './PlayerChatComposer';

export function BattleHUD() {
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [activeHeroId, setActiveHeroId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [planningOverlayVisible, setPlanningOverlayVisible] = useState(false);
  const [battleStartPending, setBattleStartPending] = useState(false);
  const messageIdRef = useRef(0);

  useEffect(() => {
    const stateHandler = (state: BattleState) => {
      setBattleState(state);
      setActiveHeroId((current) => {
        if (current && state.heroes.some((hero) => hero.id === current)) {
          return current;
        }
        return state.heroes[0]?.id ?? null;
      });
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
          (go) => `${go.group}: ${go.intent.replace(/_/g, ' ')}`
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

    return () => {
      EventBus.removeListener('battle-state-update', stateHandler);
      EventBus.removeListener('hero-chat-response', heroResponseHandler);
      EventBus.removeListener('hero-selected', heroSelectionHandler);
      EventBus.removeListener('directive-parsed', directiveParsedHandler);
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
  const isPlanning = battleState?.mode === 'battle' && battleState.phase === 'init';
  const currentDecision = activeHero?.currentDecision;
  const currentDirective = activeHero?.currentDirective;
  const armyPlan = formatPlan(currentDecision);
  const intentLabel = formatIntentLabel(currentDecision);
  const heroPlan = formatGroupPlan(currentDecision, 'hero');
  const warriorPlan = formatGroupPlan(currentDecision, 'warriors');
  const archerPlan = formatGroupPlan(currentDecision, 'archers');
  const hasSplitPlan = Boolean(currentDecision?.groupOrders?.length);

  useEffect(() => {
    setPlanningOverlayVisible(isPlanning);
    setBattleStartPending(false);
  }, [isPlanning]);

  const leavePlayground = () => {
    EventBus.emit('playground-exit-requested');
  };

  const startBattle = () => {
    setBattleStartPending(true);
    setPlanningOverlayVisible(false);
    EventBus.emit('battle-start-requested');
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
          <span style={{ color: isPlayground ? '#ffcc66' : '#ff6644', fontSize: '15px' }}>
            {isPlayground ? 'PLAYGROUND' : 'BATTLE'}
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
                fontSize: '10px',
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
                fontSize: '12px',
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

        <div
          style={{
            padding: '6px 8px',
            border: '1px solid #3b3b3b',
            borderRadius: '6px',
            backgroundColor: hasSplitPlan ? '#171b12' : '#141414',
          }}
        >
          <div style={{ color: '#9a9a9a', marginBottom: '4px', fontSize: '11px' }}>
            {hasSplitPlan ? 'Hero Plan' : 'Army Plan'}
          </div>
          <PlanRow label="Army" value={armyPlan} color="#ffd700" />
          <PlanRow label="Hero" value={heroPlan} color="#f3c86b" />
          <PlanRow label="Warriors" value={warriorPlan} color="#ff9d66" />
          <PlanRow label="Archers" value={archerPlan} color="#8fc7ff" />
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
          disabled={isPlanning}
          disabledNote="Battle comms unlock after you press Start Battle."
          placeholder="Available after Start Battle..."
        />
      </div>

      {isPlanning && !battleStartPending && (
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
                  fontSize: '11px',
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
                  width: 'min(500px, calc(100% - 48px))',
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
                    <div style={{ color: '#ffd700', fontSize: '15px', marginBottom: '4px' }}>Battle Start</div>
                    <div style={{ color: '#cdbd97', fontSize: '11px' }}>
                      Optional: send an opening order, review the plan on the right, then start combat.
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
                      fontSize: '11px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Hide Panel
                  </button>
                </div>

                <PlayerChatComposer
                  heroes={battleState?.heroes ?? []}
                  activeHeroId={activeHero?.id ?? null}
                  onActiveHeroChange={setActiveHeroId}
                  onSend={handleSend}
                  layout="compact"
                  title="Initial Command"
                  helperText="Optional opening order before the battle starts"
                  placeholder="Optional: @Commander hold behind the center wall..."
                  sendLabel="Send Order"
                  footerText="You can hide this panel to inspect the battlefield, then reopen it to send a command or start."
                  rows={3}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: '#9f957e', fontSize: '10px' }}>
                    The initial command is optional. Bottom battle chat stays disabled until combat begins.
                  </div>
                  <button
                    onClick={startBattle}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: '1px solid #8b5a2b',
                      backgroundColor: '#ffd700',
                      color: '#000',
                      cursor: 'pointer',
                      fontFamily: '"NeoDunggeunmoPro", monospace',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Start Battle
                  </button>
                </div>
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

function formatPlan(
  decision:
    | Pick<HeroDecision, 'intent' | 'targetId' | 'moveTo' | 'groupOrders' | 'groupOrderMode'>
    | Pick<{ group: UnitGroup; intent: HeroDecision['intent']; targetId?: string; moveTo?: { x: number; y: number } }, 'group' | 'intent' | 'targetId' | 'moveTo'>
    | undefined
): string {
  if (!decision) {
    return 'none';
  }

  if ('group' in decision && decision.group === 'all') {
    return formatPlan({
      intent: decision.intent,
      targetId: decision.targetId,
      moveTo: decision.moveTo,
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
  if (decision.moveTo) {
    parts.push(`@ (${Math.round(decision.moveTo.x)}, ${Math.round(decision.moveTo.y)})`);
  }

  return parts.join(' ');
}
