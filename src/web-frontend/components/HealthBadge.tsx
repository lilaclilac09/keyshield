import React, { useEffect, useState } from 'react';
import { API_BASE } from '../lib/auth';

type State = 'unknown' | 'ok' | 'slow' | 'down';

export const HealthBadge: React.FC = () => {
  const [state, setState] = useState<State>('unknown');
  const [latency, setLatency] = useState(0);
  const [checkedAt, setCheckedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const t0 = performance.now();
      try {
        const r = await fetch(`${API_BASE}/health`, { method: 'GET' });
        const dt = Math.round(performance.now() - t0);
        if (cancelled) return;
        setLatency(dt);
        setCheckedAt(Date.now());
        if (!r.ok) { setState('down'); return; }
        setState(dt > 2000 ? 'slow' : 'ok');
      } catch {
        if (cancelled) return;
        setLatency(Math.round(performance.now() - t0));
        setCheckedAt(Date.now());
        setState('down');
      }
    };
    probe();
    const id = window.setInterval(probe, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const color = state === 'ok' ? 'bg-emerald-400'
    : state === 'slow' ? 'bg-amber-400'
    : state === 'down' ? 'bg-rose-500'
    : 'bg-zinc-600';

  const ago = checkedAt ? Math.round((Date.now() - checkedAt) / 1000) : 0;
  const label = state === 'ok' ? `Backend healthy · ${latency}ms`
    : state === 'slow' ? `Backend slow · ${latency}ms`
    : state === 'down' ? 'Backend unreachable'
    : 'Checking backend…';

  return (
    <div
      className="flex items-center gap-2 h-10 px-3 rounded-lg border border-[#1c2238] text-[11px] text-zinc-500"
      title={`${label} · last check ${ago}s ago`}
    >
      <span className={`w-2 h-2 rounded-full ${color} ${state === 'ok' ? 'animate-pulse' : ''}`} />
      <span className="hidden sm:inline">{state === 'down' ? 'API down' : state === 'slow' ? 'slow' : 'API'}</span>
    </div>
  );
};
