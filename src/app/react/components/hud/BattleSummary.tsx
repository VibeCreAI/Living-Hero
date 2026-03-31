import { useMemo } from 'react';
import { EventBus } from '../../../../game/EventBus';
import { BattleSummaryData, DamageEvent } from '../../../../game/types';
import { CommunicationMessage } from './ChatPanel';

interface BattleSummaryProps {
  data: BattleSummaryData;
  messages: CommunicationMessage[];
}

export function BattleSummary({ data, messages }: BattleSummaryProps) {
  const stats = useMemo(() => computeStats(data, messages), [data, messages]);
  const isWin = data.result === 'allied_win';
  const floorLabel = data.floorNumber ? `Floor ${data.floorNumber}` : 'Battle';
  const outcomeLabel =
    isWin && data.floorNumber
      ? `${floorLabel} Cleared`
      : !isWin && data.floorNumber
        ? `${floorLabel} Failed`
        : isWin
          ? 'Battle Won'
          : 'Battle Lost';
  const retryLabel = data.floorNumber ? `Retry Floor ${data.floorNumber}` : 'Restart Battle';
  const advanceLabel = data.nextFloor ? `Advance to Floor ${data.nextFloor}` : null;

  return (
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
        backgroundColor: 'rgba(0,0,0,0.55)',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 'min(560px, calc(100% - 48px))',
          maxHeight: '700px',
          overflowY: 'auto',
          padding: '20px',
          borderRadius: '10px',
          border: '1px solid #5b3f1f',
          backgroundColor: '#120d09e8',
          boxShadow: '0 16px 36px rgba(0,0,0,0.38)',
          color: '#eadfc7',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          pointerEvents: 'auto',
          fontFamily: '"NeoDunggeunmoPro", monospace',
        }}
      >
        {/* Outcome Banner */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '32px',
              fontWeight: 'bold',
              color: isWin ? '#00ff00' : '#ff4444',
              textShadow: `0 0 12px ${isWin ? 'rgba(0,255,0,0.3)' : 'rgba(255,68,68,0.3)'}`,
            }}
          >
            {isWin ? 'VICTORY' : 'DEFEAT'}
          </div>
          <div style={{ fontSize: '13px', color: '#9f957e', marginTop: '4px' }}>
            Battle Duration: {formatDuration(data.durationSec)}
          </div>
          <div style={{ fontSize: '13px', color: '#cdbd97', marginTop: '6px' }}>
            {outcomeLabel}
            {isWin && data.floorNumber === data.maxFloor ? ' • Portal apex reached' : ''}
          </div>
        </div>

        <Divider />

        {/* Casualties */}
        <Section title="Casualties">
          <StatRow label="Allied Surviving" value={stats.alliedSurviving} color="#4488ff" />
          <StatRow label="  Warriors" value={stats.alliedWarriorsSurviving} color="#4488ff" />
          <StatRow label="  Ranged" value={stats.alliedArchersSurviving} color="#4488ff" />
          <StatRow label="  Hero" value={stats.heroAlive ? 'Alive' : 'Fallen'} color={stats.heroAlive ? '#00ff00' : '#ff4444'} />
          <div style={{ height: '4px' }} />
          <StatRow label="Enemies Killed" value={stats.enemiesKilled} color="#ff6644" />
          <StatRow label="  Warriors" value={stats.enemyWarriorsKilled} color="#ff6644" />
          <StatRow label="  Ranged" value={stats.enemyArchersKilled} color="#ff6644" />
        </Section>

        {/* Damage Summary */}
        <Section title="Damage">
          <StatRow label="Allied Damage Dealt" value={stats.alliedDamageDealt} color="#4488ff" />
          <StatRow label="Enemy Damage Dealt" value={stats.enemyDamageDealt} color="#ff6644" />
          {stats.topDealer && (
            <StatRow
              label="Top Damage Dealer"
              value={`${stats.topDealer.name} (${stats.topDealer.damage} dmg)`}
              color="#ffd700"
            />
          )}
        </Section>

        {/* AI Commander */}
        <Section title="AI Commander">
          <StatRow label="LLM Decisions" value={data.aiStats.llmCallCount} color="#eadfc7" />
          <StatRow label="Fallback Decisions" value={data.aiStats.fallbackCount} color="#9f957e" />
          <StatRow
            label="LLM Reliability"
            value={stats.llmReliability}
            color={stats.llmReliabilityPct >= 80 ? '#00ff00' : stats.llmReliabilityPct >= 50 ? '#ffcc66' : '#ff6644'}
          />
          {data.aiStats.lastLatencyMs > 0 && (
            <StatRow label="Last Latency" value={`${data.aiStats.lastLatencyMs}ms`} color="#9f957e" />
          )}
        </Section>

        {/* Chat Highlights */}
        {stats.chatHighlights.length > 0 && (
          <Section title="Commander Highlights">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {stats.chatHighlights.map((msg, i) => (
                <div key={i} style={{ fontSize: '12px' }}>
                  <span style={{ color: '#ffd700' }}>{msg.speakerName}: </span>
                  <span style={{ color: '#cdbd97', fontStyle: 'italic' }}>"{msg.text}"</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        <div
          style={{
            marginTop: '4px',
            display: 'flex',
            justifyContent: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => EventBus.emit('replay-battle')}
            style={{
              padding: '10px 16px',
              borderRadius: '6px',
              border: '1px solid #8b5a2b',
              backgroundColor: isWin ? '#7cff6b' : '#ffb347',
              color: '#000',
              cursor: 'pointer',
              fontFamily: '"NeoDunggeunmoPro", monospace',
              fontSize: '15px',
              fontWeight: 'bold',
            }}
          >
            {retryLabel}
          </button>
          {data.canAdvance && advanceLabel && (
            <button
              onClick={() => EventBus.emit('advance-to-next-floor')}
              style={{
                padding: '10px 16px',
                borderRadius: '6px',
                border: '1px solid #8b5a2b',
                backgroundColor: '#8fe16f',
                color: '#000',
                cursor: 'pointer',
                fontFamily: '"NeoDunggeunmoPro", monospace',
                fontSize: '15px',
                fontWeight: 'bold',
              }}
            >
              {advanceLabel}
            </button>
          )}
          <button
            onClick={() => EventBus.emit('return-to-overworld')}
            style={{
              padding: '10px 16px',
              borderRadius: '6px',
              border: '1px solid #8b5a2b',
              backgroundColor: '#ffd700',
              color: '#000',
              cursor: 'pointer',
              fontFamily: '"NeoDunggeunmoPro", monospace',
              fontSize: '15px',
              fontWeight: 'bold',
            }}
          >
            Return to Overworld
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: '#ffd700', fontSize: '14px', marginBottom: '6px' }}>{title}</div>
      <div
        style={{
          padding: '8px 10px',
          borderRadius: '6px',
          border: '1px solid #3b2c18',
          backgroundColor: '#0e0a07',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '2px' }}>
      <span style={{ color: '#b0a68e' }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: '1px', backgroundColor: '#3b2c18' }} />;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface ComputedStats {
  alliedSurviving: string;
  alliedWarriorsSurviving: string;
  alliedArchersSurviving: string;
  heroAlive: boolean;
  enemiesKilled: string;
  enemyWarriorsKilled: string;
  enemyArchersKilled: string;
  alliedDamageDealt: number;
  enemyDamageDealt: number;
  topDealer: { name: string; damage: number } | null;
  llmReliability: string;
  llmReliabilityPct: number;
  chatHighlights: CommunicationMessage[];
}

function computeStats(data: BattleSummaryData, messages: CommunicationMessage[]): ComputedStats {
  const { alliedUnits, enemyUnits, heroes, allDamageEvents, aiStats } = data;

  // Casualties
  const alliedAlive = alliedUnits.filter((u) => u.state !== 'dead');
  const alliedWarriorsAlive = alliedAlive.filter((u) => u.role === 'warrior').length;
  const alliedArchersAlive = alliedAlive.filter((u) => u.role === 'archer').length;
  const alliedWarriorsTotal = alliedUnits.filter((u) => u.role === 'warrior').length;
  const alliedArchersTotal = alliedUnits.filter((u) => u.role === 'archer').length;
  const heroAlive = heroes.length > 0 && alliedUnits.concat(enemyUnits).some(
    (u) => u.role === 'hero' && u.faction === 'allied' && u.state !== 'dead'
  );

  const enemyDead = enemyUnits.filter((u) => u.state === 'dead');
  const enemyWarriorsKilled = enemyDead.filter((u) => u.role === 'warrior').length;
  const enemyArchersKilled = enemyDead.filter((u) => u.role === 'archer').length;
  const enemyWarriorsTotal = enemyUnits.filter((u) => u.role === 'warrior').length;
  const enemyArchersTotal = enemyUnits.filter((u) => u.role === 'archer').length;

  // Damage
  const alliedDamageDealt = sumDamage(allDamageEvents, 'allied');
  const enemyDamageDealt = sumDamage(allDamageEvents, 'enemy');

  // Top dealer
  const dealerMap = new Map<string, number>();
  for (const e of allDamageEvents) {
    if (e.attackerFaction === 'allied') {
      dealerMap.set(e.attackerId, (dealerMap.get(e.attackerId) ?? 0) + e.damage);
    }
  }

  let topDealer: { name: string; damage: number } | null = null;
  let maxDmg = 0;
  for (const [id, dmg] of dealerMap) {
    if (dmg > maxDmg) {
      maxDmg = dmg;
      const unit = alliedUnits.find((u) => u.id === id);
      topDealer = { name: unit?.displayName ?? id, damage: dmg };
    }
  }

  // LLM reliability
  const totalDecisions = aiStats.llmCallCount + aiStats.fallbackCount;
  const llmReliabilityPct = totalDecisions > 0
    ? Math.round((aiStats.llmCallCount / totalDecisions) * 100)
    : 0;

  // Chat highlights — last 5 hero messages
  const heroMessages = messages.filter((m) => m.sender === 'hero');
  const chatHighlights = heroMessages.slice(-5);

  return {
    alliedSurviving: `${alliedAlive.length} / ${alliedUnits.length}`,
    alliedWarriorsSurviving: `${alliedWarriorsAlive} / ${alliedWarriorsTotal}`,
    alliedArchersSurviving: `${alliedArchersAlive} / ${alliedArchersTotal}`,
    heroAlive,
    enemiesKilled: `${enemyDead.length} / ${enemyUnits.length}`,
    enemyWarriorsKilled: `${enemyWarriorsKilled} / ${enemyWarriorsTotal}`,
    enemyArchersKilled: `${enemyArchersKilled} / ${enemyArchersTotal}`,
    alliedDamageDealt,
    enemyDamageDealt,
    topDealer,
    llmReliability: totalDecisions > 0 ? `${llmReliabilityPct}%` : 'N/A',
    llmReliabilityPct,
    chatHighlights,
  };
}

function sumDamage(events: DamageEvent[], attackerFaction: 'allied' | 'enemy'): number {
  let total = 0;
  for (const e of events) {
    if (e.attackerFaction === attackerFaction) {
      total += e.damage;
    }
  }
  return total;
}
