import React, { useEffect, useState } from 'react';
import { API_BASE } from '../lib/auth';

type State = 'unknown' | 'ok' | 'slow' | 'down';

export const HealthBadge: React.FC = () => {
  const [state, setState] = useState<State>('unknown');
  const [latency, setLatency] = useState(0);

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

  const color = state === 'ok' ? 'bg-emerald-400' : state === 'slow' ? 'bg-amber-400' : state === 'down' ? 'bg-red-500' : 'bg-zinc-600';

  return (
    <div className="flex items-center gap-2 h-10 px-3 rounded-[2px] border border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider" title={state === 'ok' ? `Backend healthy \xb7 ${latency}ms` : 'Backend status unknown'}>
      <span className={`w-1.5 h-1.5 rounded-full ${color} ${state === 'ok' ? 'animate-pulse' : ''}`} />
      <span className="hidden sm:inline">{state === 'down' ? 'Offline' : state === 'slow' ? 'Slow' : 'API'}</span>
    </div>
  );
};
