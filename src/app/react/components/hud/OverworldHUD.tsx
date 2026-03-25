import { useEffect, useState } from 'react';
import { EventBus } from '../../../../game/EventBus';

interface OverworldUpdate {
  heroPosition: { x: number; y: number };
  nearNode: string | null;
}

export function OverworldHUD() {
  const [data, setData] = useState<OverworldUpdate>({
    heroPosition: { x: 0, y: 0 },
    nearNode: null,
  });

  useEffect(() => {
    const handler = (update: OverworldUpdate) => setData(update);
    EventBus.on('overworld-update', handler);
    return () => { EventBus.removeListener('overworld-update', handler); };
  }, []);

  return (
    <div style={{ padding: '8px', color: '#ccc', fontFamily: 'monospace', fontSize: '12px' }}>
      <div style={{ marginBottom: '4px', color: '#ffd700', fontSize: '14px' }}>OVERWORLD</div>
      <div>Hero: Commander</div>
      <div>Position: ({Math.round(data.heroPosition.x)}, {Math.round(data.heroPosition.y)})</div>
      {data.nearNode && (
        <div style={{ color: '#00ff88', marginTop: '4px' }}>Near: {data.nearNode}</div>
      )}
    </div>
  );
}
