import { useEffect, useRef, useState } from 'react';
import { EventBus } from '../../../../game/EventBus';
import { PortalClearedFloor, PortalFloorNumber } from '../../../../game/types';

interface OverworldUpdate {
  heroPosition: { x: number; y: number };
  nearNode: string | null;
  nearNodeKind: 'portal' | 'node' | null;
  portalPickerOpen: boolean;
  highestUnlockedFloor: PortalFloorNumber;
  highestClearedFloor: PortalClearedFloor;
}

export function OverworldHUD() {
  const [data, setData] = useState<OverworldUpdate>({
    heroPosition: { x: 0, y: 0 },
    nearNode: null,
    nearNodeKind: null,
    portalPickerOpen: false,
    highestUnlockedFloor: 1,
    highestClearedFloor: 0,
  });
  const [selectedFloor, setSelectedFloor] = useState<PortalFloorNumber>(1);
  const pickerWasOpenRef = useRef(false);

  useEffect(() => {
    const handler = (update: OverworldUpdate) => setData(update);
    EventBus.on('overworld-update', handler);
    return () => { EventBus.removeListener('overworld-update', handler); };
  }, []);

  useEffect(() => {
    if (data.portalPickerOpen && !pickerWasOpenRef.current) {
      setSelectedFloor(data.highestUnlockedFloor);
    }
    pickerWasOpenRef.current = data.portalPickerOpen;
  }, [data.highestUnlockedFloor, data.portalPickerOpen]);

  const floors: PortalFloorNumber[] = [1, 2, 3];
  const canStartSelectedFloor = selectedFloor <= data.highestUnlockedFloor;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          padding: '8px 10px',
          color: '#ccc',
          fontFamily: '"NeoDunggeunmoPro", monospace',
          fontSize: '14px',
          border: '1px solid #3b2c18',
          borderRadius: '8px',
          backgroundColor: '#120d09d9',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ marginBottom: '4px', color: '#ffd700', fontSize: '16px' }}>OVERWORLD</div>
        <div>Hero: Commander</div>
        <div>Position: ({Math.round(data.heroPosition.x)}, {Math.round(data.heroPosition.y)})</div>
        {data.nearNode && (
          <div style={{ color: data.nearNodeKind === 'portal' ? '#ffd700' : '#00ff88', marginTop: '4px' }}>
            Near: {data.nearNode}
          </div>
        )}
        <div style={{ marginTop: '6px', color: '#bda785' }}>
          Portal: Floor {data.highestUnlockedFloor} unlocked
        </div>
        <div style={{ color: '#8fd17b' }}>
          Cleared: {data.highestClearedFloor === 0 ? 'None yet' : `Floor ${data.highestClearedFloor}`}
        </div>
      </div>

      {data.portalPickerOpen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(5, 5, 10, 0.58)',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              width: 'min(620px, calc(100% - 48px))',
              padding: '20px',
              borderRadius: '14px',
              border: '1px solid #6b5320',
              background:
                'radial-gradient(circle at top, rgba(108,82,18,0.28), rgba(16,12,8,0.96) 58%)',
              boxShadow: '0 20px 48px rgba(0,0,0,0.42)',
              color: '#eadfc7',
              fontFamily: '"NeoDunggeunmoPro", monospace',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '24px', color: '#ffd700', marginBottom: '6px' }}>Abyss Portal</div>
                <div style={{ fontSize: '13px', color: '#cdbd97' }}>
                  Higher floors bring larger enemy groups and stronger stat scaling.
                </div>
              </div>
              <button
                onClick={() => EventBus.emit('portal-picker-close-requested')}
                style={buttonStyle('#2b1b12', '#ffcf7a')}
              >
                Close
              </button>
            </div>

            <div
              style={{
                marginTop: '18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '12px',
              }}
            >
              {floors.map((floor) => {
                const isUnlocked = floor <= data.highestUnlockedFloor;
                const isCleared = floor <= data.highestClearedFloor;
                const isSelected = floor === selectedFloor;

                return (
                  <button
                    key={floor}
                    onClick={() => isUnlocked && setSelectedFloor(floor)}
                    disabled={!isUnlocked}
                    style={{
                      padding: '14px 12px',
                      borderRadius: '12px',
                      border: isSelected ? '1px solid #ffd700' : '1px solid #4d3b18',
                      backgroundColor: isUnlocked
                        ? isSelected
                          ? '#2e2211'
                          : '#19120b'
                        : '#120d09',
                      color: isUnlocked ? '#eadfc7' : '#6d6256',
                      cursor: isUnlocked ? 'pointer' : 'not-allowed',
                      textAlign: 'left',
                      boxShadow: isSelected ? '0 0 0 1px rgba(255,215,0,0.14) inset' : 'none',
                    }}
                  >
                    <div style={{ color: '#ffd700', fontSize: '18px', marginBottom: '6px' }}>Floor {floor}</div>
                    <div style={{ fontSize: '12px', color: isUnlocked ? '#cdbd97' : '#6d6256' }}>
                      {isCleared ? 'Cleared' : isUnlocked ? 'Unlocked' : 'Locked'}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '10px' }}>
                      {floor === 1 && 'Skull + Harpoon Fish'}
                      {floor === 2 && 'Lancer + Shaman'}
                      {floor === 3 && 'Minotaur + Gnoll'}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                marginTop: '18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '14px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: '13px', color: '#bda785' }}>
                Selected: Floor {selectedFloor}
                {selectedFloor > data.highestUnlockedFloor ? ' • Locked' : ' • Ready'}
              </div>
              <button
                onClick={() => EventBus.emit('portal-floor-start-requested', { floorNumber: selectedFloor })}
                disabled={!canStartSelectedFloor}
                style={buttonStyle(canStartSelectedFloor ? '#ffd700' : '#5a4d33', canStartSelectedFloor ? '#000' : '#2a2419')}
              >
                Enter Floor {selectedFloor}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function buttonStyle(backgroundColor: string, color: string) {
  return {
    padding: '9px 14px',
    borderRadius: '8px',
    border: '1px solid #8b5a2b',
    backgroundColor,
    color,
    cursor: 'pointer',
    fontFamily: '"NeoDunggeunmoPro", monospace',
    fontSize: '14px',
    fontWeight: 'bold' as const,
  };
}
