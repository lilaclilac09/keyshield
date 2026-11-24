import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE } from '../lib/auth';
import { emitAppFeedback } from '../lib/app-feedback';
import { dismissVaultSyncError, getVaultSyncStatus, subscribeVaultSyncStatus } from '../lib/vault-sync-status';

type State = 'unknown' | 'ok' | 'slow' | 'down';

export const HealthBadge: React.FC = () => {
  const sync = useSyncExternalStore(subscribeVaultSyncStatus, getVaultSyncStatus);
  const [state, setState] = useState<State>('unknown');
  const [latency, setLatency] = useState(0);
  const prev = useRef<State>('unknown');

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const t0 = performance.now();
      try {
        const r = await fetch(`${API_BASE}/health`, { method: 'GET' });
        const dt = Math.round(performance.now() - t0);
        if (cancelled) return; setLatency(dt);
        if (!r.ok) { setState('down'); return; }
        setState(dt > 2000 ? 'slow' : 'ok');
      } catch { if (cancelled) return; setLatency(Math.round(performance.now() - t0)); setState('down'); }
    };
    probe();
    const id = window.setInterval(probe, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    const previous = prev.current;
    if (state === 'down' && previous !== 'down') {
      emitAppFeedback({ kind: 'error', title: 'API offline', detail: `${latency}ms`, source: 'health' });
    } else if (state === 'ok' && (previous === 'down' || previous === 'unknown')) {
      emitAppFeedback({
        kind: previous === 'down' ? 'success' : 'info',
        title: 'API online',
        detail: `${latency}ms`,
        source: 'health',
      });
    } else if (state === 'slow' && previous !== 'slow' && previous !== 'unknown') {
      emitAppFeedback({ kind: 'info', title: 'API slow', detail: `${latency}ms`, source: 'health' });
    }
    prev.current = state;
  }, [state, latency]);

  const color = state === 'ok' ? 'bg-emerald-400' : state === 'slow' ? 'bg-amber-400' : state === 'down' ? 'bg-red-500' : 'bg-zinc-600';

  return (
    <div className="space-y-1">
    <div className="flex items-center gap-2 h-8 px-4 rounded-lg border border-[#243365] text-[13px] text-[#8a96c2] uppercase tracking-wider" title={state === 'ok' ? `API healthy \xb7 ${latency}ms` : 'API status unknown'}>
      <span className={`w-2 h-2 rounded-full ${color} ${state === 'ok' ? 'animate-pulse' : ''}`} />
      <span>{state === 'unknown' ? 'API: checking…' : state === 'down' ? `API offline · ${latency}ms` : state === 'slow' ? `API slow · ${latency}ms` : `API online · ${latency}ms`}</span>
    </div>
    <p role="status" className="text-[12px] text-[#a8b3d8]">Vault sync: {sync.outcome === 'failed' ? 'last change not saved' : sync.outcome === 'saved' ? 'last change saved' : 'no change attempted'}</p>
    {sync.message && createPortal(<div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-red-900 bg-[#131c39] p-4 text-[12px] text-red-300">
      <p>{sync.message}</p>
      <button type="button" onClick={dismissVaultSyncError} className="underline">Dismiss vault sync error</button>
    </div>, document.body)}
    </div>
  );
};
