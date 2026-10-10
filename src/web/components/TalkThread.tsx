import React, { useMemo, useState } from 'react';
import { TALK_THREADS } from '../lib/talk-threads';

export const TalkThread: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  const allIds = useMemo(
    () => TALK_THREADS.flatMap((t) => t.turns.map((turn) => `${t.id}:${turn.id}`)),
    [],
  );
  const [open, setOpen] = useState<Set<string>>(() => new Set(['review:a']));

  const toggle = (key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#0b1226] text-white flex flex-col" style={{ fontFamily: "'Montserrat', 'Inter', sans-serif" }}>
      <div className="h-14 border-b border-[#243365]/60 bg-[#0e1631] px-6 flex items-center justify-between">
        <div>
          <h1 className="text-[14px] font-bold uppercase tracking-wider">Talk</h1>
          <p className="text-[10px] text-[#8a96c2]">一条对话一折 · 点标题展开</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(new Set(allIds))}
            className="text-[11px] text-[#8a96c2] hover:text-white"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setOpen(new Set())}
            className="text-[11px] text-[#8a96c2] hover:text-white"
          >
            Fold all
          </button>
          {onExit && (
            <button type="button" onClick={onExit} className="text-[11px] text-[#8a96c2] hover:text-white">
              Full dashboard
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto px-6 py-8">
        <div className="max-w-xl mx-auto space-y-8">
          {TALK_THREADS.map((thread) => (
            <section key={thread.id} className="space-y-3">
              <header>
                <h2 className="text-[13px] font-bold uppercase tracking-wider">{thread.title}</h2>
                <p className="text-[11px] text-[#8a96c2]">{thread.subtitle}</p>
              </header>
              <ol className="space-y-2">
                {thread.turns.map((turn, i) => {
                  const key = `${thread.id}:${turn.id}`;
                  const expanded = open.has(key);
                  return (
                    <li key={turn.id} className="rounded-xl border border-[#243365]/50 bg-[#131c39] overflow-hidden">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggle(key)}
                        className="w-full px-4 py-3 flex items-start gap-3 text-left"
                      >
                        <span className={`mt-0.5 text-[10px] uppercase tracking-wider ${turn.role === 'you' ? 'text-amber-300' : 'text-[#8a96c2]'}`}>
                          {expanded ? '▾' : '▸'} {i + 1}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-semibold">{turn.title}</span>
                          <span className="block text-[10px] text-[#8a96c2] uppercase tracking-wider">{turn.hint}</span>
                        </span>
                      </button>
                      {expanded && (
                        <div className="px-4 pb-4 pt-0 space-y-2 border-t border-[#243365]/40">
                          {turn.body.map((line) => (
                            <p key={line} className="text-[13px] text-[#d5dcf0] leading-relaxed">{line}</p>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export function isTalkPath(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/talk' || path === '/review') return true;
  if (window.location.hash === '#/talk' || window.location.hash === '#/review') return true;
  const q = new URLSearchParams(window.location.search);
  return q.has('talk') || q.has('review');
}
