import { useEffect, useState } from 'react';
import { EventBus } from '../../../../game/EventBus';
import {
  BattleState,
  GroupOrder,
  HeroDecision,
  PathfindingBenchmarkResult,
  UnitGroup,
} from '../../../../game/types';

interface DebugData {
  heroName: string;
  directive: string;
  intent: string;
  rationale: string;
  priority: string;
  recheckInSec: number;
  alliedCount: number;
  enemyCount: number;
  timeSec: number;
  targetId: string;
  moveTo: string;
  armyPlan: string;
  heroPlan: string;
  warriorPlan: string;
  archerPlan: string;
  unitOrder: string;
  unitTarget: string;
  warriorExec: string;
  archerExec: string;
  recentHit: string;
  pathJpsHits: number;
  pathJpsRejects: number;
  pathAStarFallbacks: number;
  pathNoPath: number;
}

export function DebugPanel({ activeHeroId }: { activeHeroId: string | null }) {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<DebugData | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<PathfindingBenchmarkResult | null>(null);

  useEffect(() => {
    const handler = (state: BattleState) => {
      if (!visible || state.heroes.length === 0) return;

      const hero =
        state.heroes.find((candidate) => candidate.id === activeHeroId) ?? state.heroes[0];
      const decision = hero.currentDecision;
      const firstAlly = state.alliedUnits.find((u) => u.state !== 'dead');
      const firstWarrior = state.alliedUnits.find((u) => u.state !== 'dead' && u.role === 'warrior');
      const firstArcher = state.alliedUnits.find((u) => u.state !== 'dead' && u.role === 'archer');
      const lastHit = [...state.recentDamage]
        .reverse()
        .find((event) => event.targetFaction === 'allied');

      setData({
        heroName: hero.name,
        directive: hero.currentDirective ?? 'none',
        intent: decision?.intent ?? 'none',
        rationale: decision?.rationaleTag ?? 'none',
        priority: decision?.priority ?? 'none',
        recheckInSec: decision?.recheckInSec ?? 0,
        alliedCount: state.alliedUnits.filter((u) => u.state !== 'dead').length,
        enemyCount: state.enemyUnits.filter((u) => u.state !== 'dead').length,
        timeSec: state.timeSec,
        targetId: decision?.targetId ?? 'none',
        moveTo: decision?.moveToTile
          ? `[${decision.moveToTile.col}, ${decision.moveToTile.row}]`
          : 'none',
        armyPlan: formatArmyPlan(decision),
        heroPlan: formatGroupPlan(decision, 'hero'),
        warriorPlan: formatGroupPlan(decision, 'warriors'),
        archerPlan: formatGroupPlan(decision, 'archers'),
        unitOrder: firstAlly?.orderMode ?? 'none',
        unitTarget: firstAlly?.orderTargetId ?? firstAlly?.targetId ?? 'none',
        warriorExec: firstWarrior
          ? `${firstWarrior.orderMode ?? 'none'} / ${firstWarrior.orderTargetId ?? firstWarrior.targetId ?? 'none'}`
          : 'none',
        archerExec: firstArcher
          ? `${firstArcher.orderMode ?? 'none'} / ${firstArcher.orderTargetId ?? firstArcher.targetId ?? 'none'}`
          : 'none',
        recentHit: lastHit ? `${lastHit.attackerId} -> ${lastHit.targetId} (${lastHit.damage})` : 'none',
        pathJpsHits: state.pathfindingStats.staticJpsHits,
        pathJpsRejects: state.pathfindingStats.jpsConflictRejects,
        pathAStarFallbacks: state.pathfindingStats.aStarFallbackCount,
        pathNoPath: state.pathfindingStats.noPathCount,
      });
    };

    const benchmarkHandler = (result: PathfindingBenchmarkResult) => {
      setBenchmarkResult(result);
    };

    EventBus.on('battle-state-update', handler);
    EventBus.on('pathfinding-benchmark-result', benchmarkHandler);

    // Toggle with backtick key
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === '`') setVisible((v) => !v);
    };
    window.addEventListener('keydown', keyHandler);

    return () => {
      EventBus.removeListener('battle-state-update', handler);
      EventBus.removeListener('pathfinding-benchmark-result', benchmarkHandler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [activeHeroId, visible]);

  if (!visible) {
    return (
      <div
        style={{
          marginTop: '4px',
          fontSize: '9px',
          color: '#555',
          fontFamily: '"NeoDunggeunmoPro", monospace',
        }}
      >
        Press ` for debug
      </div>
    );
  }

  if (!data) return null;

  const rows: [string, string][] = [
    ['Hero', data.heroName],
    ['Directive', data.directive],
    ['Intent', data.intent],
    ['Rationale', data.rationale],
    ['Priority', data.priority],
    ['Recheck', `${data.recheckInSec.toFixed(1)}s`],
    ['Target', data.targetId],
    ['MoveTo', data.moveTo],
    ['ArmyPlan', data.armyPlan],
    ['HeroPlan', data.heroPlan],
    ['WarPlan', data.warriorPlan],
    ['RngPlan', data.archerPlan],
    ['UnitOrder', data.unitOrder],
    ['UnitTarget', data.unitTarget],
    ['WarExec', data.warriorExec],
    ['RngExec', data.archerExec],
    ['RecentHit', data.recentHit],
    ['JpsHits', String(data.pathJpsHits)],
    ['JpsRej', String(data.pathJpsRejects)],
    ['A*Back', String(data.pathAStarFallbacks)],
    ['NoPath', String(data.pathNoPath)],
    ['Allies', String(data.alliedCount)],
    ['Enemies', String(data.enemyCount)],
    ['Time', `${data.timeSec.toFixed(1)}s`],
  ];

  return (
    <div
      style={{
        marginTop: '6px',
        padding: '6px 8px',
        border: '1px solid #ff660044',
        borderRadius: '3px',
        backgroundColor: '#1a0a00',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        fontSize: '10px',
        color: '#ff9944',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '4px',
          fontSize: '11px',
        }}
      >
        <span>DEBUG</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={() => EventBus.emit('run-pathfinding-benchmark')}
            style={{
              background: 'none',
              border: '1px solid #ff660066',
              color: '#ffcc88',
              cursor: 'pointer',
              fontFamily: '"NeoDunggeunmoPro", monospace',
              fontSize: '10px',
              padding: '1px 4px',
            }}
          >
            bench
          </button>
          <button
            onClick={() => setVisible(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ff6644',
              cursor: 'pointer',
              fontFamily: '"NeoDunggeunmoPro", monospace',
              fontSize: '10px',
            }}
          >
            [x]
          </button>
        </div>
      </div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: '8px', marginBottom: '1px' }}>
          <span style={{ color: '#886633', minWidth: '60px' }}>{label}:</span>
          <span>{value}</span>
        </div>
      ))}
      {benchmarkResult && (
        <div style={{ marginTop: '6px', color: '#ffd4a1' }}>
          Bench: {benchmarkResult.queryCount}q | hybrid {benchmarkResult.hybridTimeMs.toFixed(2)}ms
          {' | '}
          a* {benchmarkResult.aStarTimeMs.toFixed(2)}ms | mismatch {benchmarkResult.mismatchedCostCount}
        </div>
      )}
    </div>
  );
}

function formatArmyPlan(decision?: HeroDecision): string {
  if (!decision) {
    return 'none';
  }

  if (decision.groupOrderMode === 'explicit_only' && decision.groupOrders?.length) {
    const allGroupOrder = decision.groupOrders.find((groupOrder) => groupOrder.group === 'all');
    if (allGroupOrder) {
      return formatPlan(allGroupOrder.intent, allGroupOrder.targetId, allGroupOrder.moveToTile);
    }
    return 'unchanged';
  }

  return formatPlan(decision.intent, decision.targetId, decision.moveToTile);
}

function formatGroupPlan(decision: HeroDecision | undefined, group: UnitGroup): string {
  if (!decision) {
    return 'default';
  }

  const groupOrder = decision.groupOrders?.find((candidate) => candidate.group === group);
  return groupOrder ? formatGroupOrder(groupOrder) : 'default';
}

function formatGroupOrder(groupOrder: GroupOrder): string {
  return formatPlan(groupOrder.intent, groupOrder.targetId, groupOrder.moveToTile);
}

function formatPlan(
  intent: string,
  targetId?: string,
  moveToTile?: { col: number; row: number }
): string {
  const parts = [intent];
  if (targetId) {
    parts.push(targetId);
  }
  if (moveToTile) {
    parts.push(`[${moveToTile.col},${moveToTile.row}]`);
  }
  return parts.join(' / ');
}
