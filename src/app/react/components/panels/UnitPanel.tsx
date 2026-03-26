import { UnitState } from '../../../../game/types';

interface UnitPanelProps {
  unit: UnitState | null;
}

export function UnitPanel({ unit }: UnitPanelProps) {
  if (!unit) return null;

  const hpPercent = Math.round((unit.hp / unit.maxHp) * 100);
  const hpColor = hpPercent > 50 ? '#00cc00' : hpPercent > 25 ? '#cccc00' : '#cc0000';

  return (
    <div style={{ padding: '8px', color: '#ccc', fontFamily: '"NeoDunggeunmoPro", monospace', fontSize: '11px', borderTop: '1px solid #444' }}>
      <div style={{ color: '#aaa', fontSize: '10px', marginBottom: '2px' }}>SELECTED UNIT</div>
      <div>{unit.role.toUpperCase()} ({unit.faction})</div>
      <div>
        HP: <span style={{ color: hpColor }}>{unit.hp}/{unit.maxHp}</span> ({hpPercent}%)
      </div>
      <div>State: {unit.state}</div>
      <div>ATK: {unit.attack} | RNG: {unit.attackRange}</div>
    </div>
  );
}
