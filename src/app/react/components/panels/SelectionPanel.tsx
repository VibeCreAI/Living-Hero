import { useEffect, useState } from 'react';
import { EventBus } from '../../../../game/EventBus';
import { UnitState, HeroState } from '../../../../game/types';

type Selection =
  | { type: 'unit'; data: UnitState }
  | { type: 'hero'; data: HeroState }
  | null;

export function SelectionPanel() {
  const [selection, setSelection] = useState<Selection>(null);

  useEffect(() => {
    const unitHandler = (state: UnitState) => {
      setSelection({ type: 'unit', data: state });
    };
    const heroHandler = (state: HeroState) => {
      setSelection({ type: 'hero', data: state });
    };

    EventBus.on('unit-selected', unitHandler);
    EventBus.on('hero-selected', heroHandler);

    return () => {
      EventBus.removeListener('unit-selected', unitHandler);
      EventBus.removeListener('hero-selected', heroHandler);
    };
  }, []);

  if (!selection) return null;

  return (
    <div
      style={{
        marginTop: '6px',
        padding: '6px 8px',
        border: '1px solid #444',
        borderRadius: '3px',
        backgroundColor: '#1a1a2e',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        fontSize: '13px',
        color: '#ccc',
      }}
    >
      {selection.type === 'unit' && <UnitInfo unit={selection.data} />}
      {selection.type === 'hero' && <HeroInfo hero={selection.data} />}
      <button
        onClick={() => setSelection(null)}
        style={{
          marginTop: '4px',
          padding: '2px 8px',
          backgroundColor: '#333',
          color: '#888',
          border: '1px solid #555',
          borderRadius: '2px',
          cursor: 'pointer',
          fontFamily: '"NeoDunggeunmoPro", monospace',
          fontSize: '14px',
        }}
      >
        Deselect
      </button>
    </div>
  );
}

function UnitInfo({ unit }: { unit: UnitState }) {
  const hpPct = Math.round((unit.hp / unit.maxHp) * 100);
  const factionColor = unit.faction === 'allied' ? '#4488ff' : '#ff4444';

  return (
    <>
      <div style={{ color: factionColor, fontSize: '14px', marginBottom: '3px' }}>
        {unit.displayName ?? `${unit.faction.toUpperCase()} ${unit.role.toUpperCase()}`}
      </div>
      <div>
        HP: {unit.hp}/{unit.maxHp} ({hpPct}%)
      </div>
      <div>State: {unit.state}</div>
      {unit.isPassive && <div>Behavior: passive target</div>}
      {unit.orderMode && <div>Order: {unit.orderMode}</div>}
      <div>
        Tile: [{unit.tile.col}, {unit.tile.row}]
      </div>
      {unit.targetId && <div>Target: {unit.targetId}</div>}
    </>
  );
}

function HeroInfo({ hero }: { hero: HeroState }) {
  const decision = hero.currentDecision;

  return (
    <>
      <div style={{ color: '#ffd700', fontSize: '14px', marginBottom: '3px' }}>
        {hero.name}
      </div>
      <div>
        Tile: [{hero.tile.col}, {hero.tile.row}]
      </div>
      {hero.currentDirective && <div>Directive: {hero.currentDirective}</div>}
      {decision && (
        <>
          <div>Intent: {decision.intent.replace(/_/g, ' ')}</div>
          <div>Rationale: {decision.rationaleTag.replace(/_/g, ' ')}</div>
          <div>Priority: {decision.priority}</div>
          <div>Recheck: {decision.recheckInSec.toFixed(1)}s</div>
          {decision.moveToTile && (
            <div>
              MoveTo: [{decision.moveToTile.col}, {decision.moveToTile.row}]
            </div>
          )}
          {decision.groupOrders?.map((groupOrder) => (
            <div key={groupOrder.group}>
              {formatGroupLabel(groupOrder.group)}: {groupOrder.intent.replace(/_/g, ' ')}
              {groupOrder.targetId ? ` -> ${groupOrder.targetId}` : ''}
              {groupOrder.moveToTile
                ? ` @ [${groupOrder.moveToTile.col}, ${groupOrder.moveToTile.row}]`
                : ''}
            </div>
          ))}
        </>
      )}
      <div style={{ marginTop: '3px', color: '#888', fontSize: '12px' }}>
        Bold:{hero.traits.boldness.toFixed(1)} Caut:{hero.traits.caution.toFixed(1)}{' '}
        Disc:{hero.traits.discipline.toFixed(1)} Emp:{hero.traits.empathy.toFixed(1)}
      </div>
    </>
  );
}

function formatGroupLabel(group: string): string {
  return group === 'archers' ? 'ranged' : group;
}
