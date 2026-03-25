import { useState, useEffect, useCallback } from 'react';

export type OllamaStatus = 'starting' | 'pulling_model' | 'connected' | 'offline';

export interface PullProgress {
  status: string;
  completed: number;
  total: number;
}

const OLLAMA_URL = 'http://localhost:11434';
const POLL_INTERVAL = 5000;

export function useOllamaStatus() {
  const [status, setStatus] = useState<OllamaStatus>('starting');
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const resp = await fetch(`${OLLAMA_URL}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (resp.ok) {
        setStatus('connected');
        return true;
      }
    } catch {
      // Ollama not reachable
    }
    return false;
  }, []);

  useEffect(() => {
    const isTauri = '__TAURI__' in window;

    if (isTauri) {
      // In Tauri: listen for events from Rust backend
      let unlisten: (() => void) | null = null;
      let unlistenProgress: (() => void) | null = null;

      (async () => {
        try {
          const { listen } = await import('@tauri-apps/api/event');

          unlisten = await listen<string>('ollama-status', (event) => {
            setStatus(event.payload as OllamaStatus);
          });

          unlistenProgress = await listen<PullProgress>('model-pull-progress', (event) => {
            setPullProgress(event.payload);
          });
        } catch {
          // Tauri API not available, fall through to polling
          startPolling();
        }
      })();

      return () => {
        unlisten?.();
        unlistenProgress?.();
      };
    } else {
      // In browser: poll health endpoint directly
      return startPolling();
    }

    function startPolling() {
      // Initial check
      checkHealth().then((ok) => {
        if (!ok) setStatus('offline');
      });

      const interval = setInterval(async () => {
        const ok = await checkHealth();
        if (!ok && status === 'connected') {
          setStatus('offline');
        }
      }, POLL_INTERVAL);

      return () => clearInterval(interval);
    }
  }, [checkHealth, status]);

  return { status, pullProgress };
}
