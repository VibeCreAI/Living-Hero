import { useOllamaStatus, OllamaStatus, PullProgress } from '../../../../hooks/useOllamaStatus';

function getStatusText(status: OllamaStatus, progress: PullProgress | null): string {
  switch (status) {
    case 'starting':
      return 'Starting AI Engine...';
    case 'pulling_model':
      if (progress && progress.total > 0) {
        const pct = Math.round((progress.completed / progress.total) * 100);
        return `Downloading Hero AI Brain... ${pct}%`;
      }
      return 'Downloading Hero AI Brain...';
    case 'connected':
      return '';
    case 'offline':
      return '';
  }
}

export function ModelDownloadOverlay() {
  const { status, pullProgress } = useOllamaStatus();

  // Don't show overlay when connected or offline (fallback mode)
  if (status === 'connected' || status === 'offline') {
    return null;
  }

  const text = getStatusText(status, pullProgress);
  const showProgress = status === 'pulling_model' && pullProgress && pullProgress.total > 0;
  const pct = showProgress ? Math.round((pullProgress!.completed / pullProgress!.total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      fontFamily: '"NeoDunggeunmoPro", monospace',
      color: '#ffffff',
    }}>
      <h1 style={{ fontSize: '32px', marginBottom: '24px', color: '#ffd700' }}>
        Living Heros
      </h1>

      <p style={{ fontSize: '16px', marginBottom: '20px' }}>
        {text}
      </p>

      {showProgress && (
        <div style={{ width: '400px', marginBottom: '12px' }}>
          <div style={{
            width: '100%',
            height: '20px',
            backgroundColor: '#333',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${pct}%`,
              height: '100%',
              backgroundColor: '#4488ff',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <p style={{ fontSize: '12px', color: '#888', marginTop: '8px', textAlign: 'center' }}>
            {pullProgress!.status}
          </p>
        </div>
      )}

      {status === 'starting' && (
        <p style={{ fontSize: '12px', color: '#666', marginTop: '16px' }}>
          This only happens once.
        </p>
      )}
    </div>
  );
}
