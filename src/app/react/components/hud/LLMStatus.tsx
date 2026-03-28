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
        fontFamily: '"NeoDunggeunmoPro", monospace',
        fontSize: '13px',
        fontWeight: 400,
        lineHeight: 1.2,
        letterSpacing: '0px',
        textRendering: 'optimizeSpeed',
        WebkitFontSmoothing: 'none',
        textShadow: '0 1px 0 rgba(0,0,0,0.75)',
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
