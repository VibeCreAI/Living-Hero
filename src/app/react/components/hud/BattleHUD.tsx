import { useEffect, useState } from 'react';
import { EventBus } from '../../../../game/EventBus';
import { BattleState, HeroDecision, UnitGroup } from '../../../../game/types';
import { ChatPanel } from './ChatPanel';
import { LLMStatus } from './LLMStatus';
import { DecisionTimeline } from './DecisionTimeline';
import { SelectionPanel } from '../panels/SelectionPanel';
import { DebugPanel } from '../panels/DebugPanel';

export function BattleHUD() {
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [heroIntent, setHeroIntent] = useState('Awaiting orders...');
  const [rationaleTag, setRationaleTag] = useState('');

  useEffect(() => {
    const stateHandler = (state: BattleState) => {
      setBattleState(state);
      if (state.heroes.length > 0) {
        const hero = state.heroes[0];
        if (hero.currentDecision) {
          setHeroIntent(hero.currentDecision.intent);
          setRationaleTag(hero.currentDecision.rationaleTag);
        }
      }
    };

    EventBus.on('battle-state-update', stateHandler);

    return () => {
      EventBus.removeListener('battle-state-update', stateHandler);
    };
  }, []);

  const leavePlayground = () => {
    EventBus.emit('playground-exit-requested');
  };

  const alliedAlive = battleState?.alliedUnits.filter((u) => u.state !== 'dead').length ?? 0;
  const enemyAlive = battleState?.enemyUnits.filter((u) => u.state !== 'dead').length ?? 0;
  const timeSec = battleState?.timeSec ?? 0;
  const isPlayground = battleState?.mode === 'playground';
  const isPlanning = battleState?.mode === 'battle' && battleState.phase === 'init';
  const currentDecision = battleState?.heroes[0]?.currentDecision;
  const currentDirective = battleState?.heroes[0]?.currentDirective;
  const armyPlan = formatPlan(currentDecision);
  const warriorPlan = formatGroupPlan(currentDecision, 'warriors');
  const archerPlan = formatGroupPlan(currentDecision, 'archers');
  const hasSplitPlan = Boolean(currentDecision?.groupOrders?.length);

  const startBattle = () => {
    EventBus.emit('battle-start-requested');
  };

  return (
    <div
      style={{
        padding: '8px',
        color: '#ccc',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        fontSize: '13px',
        fontWeight: 400,
        lineHeight: 1.28,
        letterSpacing: '0px',
        textRendering: 'optimizeSpeed',
        WebkitFontSmoothing: 'none',
        textShadow: '0 1px 0 rgba(0,0,0,0.75)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ color: isPlayground ? '#ffcc66' : '#ff6644', fontSize: '15px' }}>
          {isPlayground ? 'PLAYGROUND' : 'BATTLE'}
        </span>
        <LLMStatus />
      </div>

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: '#4488ff' }}>Allies: {alliedAlive}</span>
        {' | '}
        <span style={{ color: isPlayground ? '#ffcc66' : '#ff4444' }}>
          {isPlayground ? 'Targets' : 'Enemies'}: {enemyAlive}
        </span>
        {' | '}
        <span>Time: {timeSec.toFixed(1)}s</span>
      </div>

      {isPlanning && (
        <div
          style={{
            marginBottom: '8px',
            padding: '6px 8px',
            border: '1px solid #8b5a2b',
            borderRadius: '3px',
            backgroundColor: '#22170f',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div style={{ color: '#ffdd99' }}>
            Pre-battle planning: chat your strategy to the commander, review the plan, then start combat.
          </div>
          <button
            onClick={startBattle}
            style={{
              padding: '4px 10px',
              fontFamily: '"NeoDunggeunmoPro", monospace',
              fontSize: '12px',
              cursor: 'pointer',
              backgroundColor: '#ffd700',
              color: '#000',
              border: '1px solid #8b5a2b',
              borderRadius: '3px',
              whiteSpace: 'nowrap',
            }}
          >
            Start Battle
          </button>
        </div>
      )}

      {isPlayground && (
        <div
          style={{
            marginBottom: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ color: '#9ec7d8' }}>
            Click a target to inspect it, then chat directives to the commander to test obedience and routing.
          </span>
          <button
            onClick={leavePlayground}
            style={{
              padding: '4px 8px',
              fontFamily: '"NeoDunggeunmoPro", monospace',
              fontSize: '12px',
              cursor: 'pointer',
              backgroundColor: '#2b1b12',
              color: '#ffcc66',
              border: '1px solid #8b5a2b',
              borderRadius: '3px',
              whiteSpace: 'nowrap',
            }}
          >
            Back To Overworld
          </button>
        </div>
      )}

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: '#ffd700' }}>Intent: </span>
        <span>{heroIntent}</span>
        {rationaleTag && (
          <span style={{ color: '#888', marginLeft: '6px' }}>({rationaleTag})</span>
        )}
      </div>

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: '#9ec7d8' }}>Directive: </span>
        <span>{currentDirective ? `"${currentDirective}"` : 'none'}</span>
      </div>

      <div
        style={{
          marginBottom: '8px',
          padding: '6px 8px',
          border: '1px solid #3b3b3b',
          borderRadius: '3px',
          backgroundColor: hasSplitPlan ? '#171b12' : '#141414',
        }}
      >
        <div style={{ color: '#9a9a9a', marginBottom: '4px', fontSize: '11px' }}>
          {hasSplitPlan ? 'Commander Plan' : 'Army Plan'}
        </div>
        <PlanRow label="Army" value={armyPlan} color="#ffd700" />
        <PlanRow label="Warriors" value={warriorPlan} color="#ff9d66" />
        <PlanRow label="Archers" value={archerPlan} color="#8fc7ff" />
      </div>

      <ChatPanel />
      <DecisionTimeline />
      <SelectionPanel />
      <DebugPanel />
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

function formatGroupPlan(
  decision: HeroDecision | undefined,
  group: UnitGroup
): string {
  if (!decision) {
    return 'none';
  }

  const groupOrder = decision.groupOrders?.find((candidate) => candidate.group === group);
  return groupOrder ? formatPlan(groupOrder) : 'default';
}

function formatPlan(
  decision:
    | Pick<HeroDecision, 'intent' | 'targetId' | 'moveTo'>
    | undefined
): string {
  if (!decision) {
    return 'none';
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
