import { useEffect, useRef, useState } from 'react';
import { EventBus } from '../../../../game/EventBus';
import { BattleState, GroupOrder, HeroDecision, Position, UnitGroup } from '../../../../game/types';

interface DecisionEntry {
  timeSec: number;
  directive: string;
  rationale: string;
  armyPlan: string;
  warriorPlan: string;
  archerPlan: string;
}

export function DecisionTimeline() {
  const [entries, setEntries] = useState<DecisionEntry[]>([]);
  const lastDecisionKeyRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (state: BattleState) => {
      if (state.heroes.length === 0) {
        return;
      }

      const hero = state.heroes[0];
      const decision = hero.currentDecision;
      if (!decision) {
        return;
      }

      const unitLookup = buildUnitLookup(state);
      const directive = hero.currentDirective ?? 'none';
      const armyPlan = formatPlan(decision, unitLookup);
      const warriorPlan = formatGroupPlan(decision, 'warriors', unitLookup);
      const archerPlan = formatGroupPlan(decision, 'archers', unitLookup);
      const decisionKey = [
        directive,
        decision.rationaleTag,
        armyPlan,
        warriorPlan,
        archerPlan,
      ].join('|');

      if (decisionKey === lastDecisionKeyRef.current) {
        return;
      }

      lastDecisionKeyRef.current = decisionKey;
      setEntries((prev) => [
        ...prev.slice(-15),
        {
          timeSec: state.timeSec,
          directive,
          rationale: decision.rationaleTag.replace(/_/g, ' '),
          armyPlan,
          warriorPlan,
          archerPlan,
        },
      ]);
    };

    EventBus.on('battle-state-update', handler);
    return () => {
      EventBus.removeListener('battle-state-update', handler);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [entries]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: '6px',
        border: '1px solid #333',
        borderRadius: '3px',
        backgroundColor: '#111',
      }}
    >
      <div
        style={{
          padding: '3px 6px',
          borderBottom: '1px solid #333',
          color: '#888',
          fontSize: '10px',
        }}
      >
        Decision Log
      </div>
      <div
        ref={scrollRef}
        style={{
          maxHeight: '180px',
          overflowY: 'auto',
          padding: '4px 6px',
          fontSize: '10px',
          fontFamily: 'monospace',
        }}
      >
        {entries.map((entry, index) => (
          <div
            key={`${entry.timeSec}-${index}`}
            style={{
              marginBottom: '6px',
              paddingBottom: '6px',
              borderBottom: index === entries.length - 1 ? 'none' : '1px solid #222',
            }}
          >
            <div style={{ color: '#aaa', marginBottom: '2px' }}>
              <span style={{ color: '#666' }}>[{entry.timeSec.toFixed(1)}s]</span>{' '}
              <span style={{ color: '#ffd700' }}>{entry.rationale}</span>
            </div>
            <DetailRow label="Directive" value={entry.directive} color="#9ec7d8" />
            <DetailRow label="Army" value={entry.armyPlan} color="#ffd700" />
            <DetailRow label="Warriors" value={entry.warriorPlan} color="#ff9d66" />
            <DetailRow label="Archers" value={entry.archerPlan} color="#8fc7ff" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '1px' }}>
      <span style={{ color, minWidth: '54px' }}>{label}:</span>
      <span style={{ color: '#aaa' }}>{value}</span>
    </div>
  );
}

function buildUnitLookup(state: BattleState): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const unit of [...state.alliedUnits, ...state.enemyUnits]) {
    lookup.set(unit.id, unit.displayName ?? unit.id);
  }

  return lookup;
}

function formatGroupPlan(
  decision: HeroDecision,
  group: UnitGroup,
  unitLookup: Map<string, string>
): string {
  const groupOrder = decision.groupOrders?.find((candidate) => candidate.group === group);
  return groupOrder ? formatGroupOrder(groupOrder, unitLookup) : 'default';
}

function formatGroupOrder(groupOrder: GroupOrder, unitLookup: Map<string, string>): string {
  return formatPlan(groupOrder, unitLookup);
}

function formatPlan(
  decision: Pick<HeroDecision, 'intent' | 'targetId' | 'moveTo'>,
  unitLookup: Map<string, string>
): string {
  const parts = [decision.intent.replace(/_/g, ' ')];
  if (decision.targetId) {
    parts.push(`target ${formatTarget(decision.targetId, unitLookup)}`);
  }
  if (decision.moveTo) {
    parts.push(`move ${formatPosition(decision.moveTo)}`);
  }

  return parts.join(' | ');
}

function formatTarget(targetId: string, unitLookup: Map<string, string>): string {
  const label = unitLookup.get(targetId);
  return label && label !== targetId ? `${label} [${targetId}]` : targetId;
}

function formatPosition(position: Position): string {
  return `(${Math.round(position.x)}, ${Math.round(position.y)})`;
}
