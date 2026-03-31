import { useEffect, useRef, useState } from 'react';
import { EventBus } from '../../../../game/EventBus';
import { BattleState, GroupOrder, HeroDecision, TileCoord, UnitGroup } from '../../../../game/types';

interface DecisionEntry {
  timeSec: number;
  heroName: string;
  directive: string;
  rationale: string;
  armyPlan: string;
  heroPlan: string;
  warriorPlan: string;
  archerPlan: string;
}

export function DecisionTimeline({ activeHeroId }: { activeHeroId: string | null }) {
  const [entries, setEntries] = useState<DecisionEntry[]>([]);
  const lastDecisionKeyRef = useRef('');
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (state: BattleState) => {
      if (sessionIdRef.current !== state.sessionId) {
        sessionIdRef.current = state.sessionId;
        lastDecisionKeyRef.current = '';
        setEntries([]);
      }

      if (state.heroes.length === 0) {
        return;
      }

      const hero =
        state.heroes.find((candidate) => candidate.id === activeHeroId) ?? state.heroes[0];
      const decision = hero.currentDecision;
      if (!decision) {
        return;
      }

      const unitLookup = buildUnitLookup(state);
      const directive = hero.currentDirective ?? 'none';
      const armyPlan = formatPlan(decision, unitLookup);
      const heroPlan = formatGroupPlan(decision, 'hero', unitLookup);
      const warriorPlan = formatGroupPlan(decision, 'warriors', unitLookup);
      const archerPlan = formatGroupPlan(decision, 'archers', unitLookup);
      const decisionKey = [
        hero.id,
        directive,
        decision.rationaleTag,
        armyPlan,
        heroPlan,
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
          heroName: hero.name,
          directive,
          rationale: decision.rationaleTag.replace(/_/g, ' '),
          armyPlan,
          heroPlan,
          warriorPlan,
          archerPlan,
        },
      ]);
    };

    EventBus.on('battle-state-update', handler);
    return () => {
      EventBus.removeListener('battle-state-update', handler);
    };
  }, [activeHeroId]);

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
        fontFamily: '"NeoDunggeunmoPro", monospace',
        fontWeight: 400,
        lineHeight: 1.28,
        letterSpacing: '0px',
        textRendering: 'optimizeSpeed',
        WebkitFontSmoothing: 'none',
        textShadow: '0 1px 0 rgba(0,0,0,0.75)',
      }}
    >
      <div
        style={{
          padding: '3px 6px',
          borderBottom: '1px solid #333',
          color: '#888',
          fontSize: '13px',
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
          fontSize: '13px',
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
              <span style={{ color: '#9ec7d8' }}>{entry.heroName}</span>{' '}
              <span style={{ color: '#ffd700' }}>{entry.rationale}</span>
            </div>
            <DetailRow label="Directive" value={entry.directive} color="#9ec7d8" />
            <DetailRow label="Army" value={entry.armyPlan} color="#ffd700" />
            <DetailRow label="Hero" value={entry.heroPlan} color="#f3c86b" />
            <DetailRow label="Warriors" value={entry.warriorPlan} color="#ff9d66" />
            <DetailRow label="Ranged" value={entry.archerPlan} color="#8fc7ff" />
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
  decision:
    | Pick<HeroDecision, 'intent' | 'targetId' | 'moveToTile' | 'groupOrders' | 'groupOrderMode'>
    | Pick<GroupOrder, 'group' | 'intent' | 'targetId' | 'moveToTile'>,
  unitLookup: Map<string, string>
): string {
  if ('group' in decision && decision.group === 'all') {
    return formatPlan(
      {
        intent: decision.intent,
        targetId: decision.targetId,
        moveToTile: decision.moveToTile,
      },
      unitLookup
    );
  }

  if (
    !('group' in decision) &&
    decision.groupOrderMode === 'explicit_only' &&
    decision.groupOrders?.length
  ) {
    const allGroupOrder = decision.groupOrders.find((candidate) => candidate.group === 'all');
    if (allGroupOrder) {
      return formatPlan(allGroupOrder, unitLookup);
    }
    return 'unchanged';
  }

  const parts = [decision.intent.replace(/_/g, ' ')];
  if (decision.targetId) {
    parts.push(`target ${formatTarget(decision.targetId, unitLookup)}`);
  }
  if (decision.moveToTile) {
    parts.push(`move ${formatTile(decision.moveToTile)}`);
  }

  return parts.join(' | ');
}

function formatTarget(targetId: string, unitLookup: Map<string, string>): string {
  const label = unitLookup.get(targetId);
  return label && label !== targetId ? `${label} [${targetId}]` : targetId;
}

function formatTile(tile: TileCoord): string {
  return `[${tile.col}, ${tile.row}]`;
}
