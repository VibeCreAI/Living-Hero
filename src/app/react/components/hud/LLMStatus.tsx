import { useOllamaStatus } from '../../../../hooks/useOllamaStatus';

const STATUS_MAP = {
  connected: { color: '#44ff44', label: 'AI Online' },
  starting: { color: '#ffdd44', label: 'AI Connecting...' },
  pulling_model: { color: '#ffdd44', label: 'Downloading Model...' },
  offline: { color: '#ff4444', label: 'AI Offline (Fallback)' },
} as const;

export function LLMStatus() {
  const { status } = useOllamaStatus();
  const info = STATUS_MAP[status];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#999',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: info.color,
          display: 'inline-block',
        }}
      />
      <span>{info.label}</span>
    </div>
  );
}
