import React, { useEffect, useState } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { VERSION, BUILD_DATE, BETA_FEEDBACK_URL } from '@keyshield/shared/lib/version';

const STORAGE_KEY = 'ks_beta_banner_dismissed_at';
const HIDE_FOR_MS = 24 * 60 * 60 * 1000;

export const BetaBanner: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { setShow(true); return; }
    const ts = parseInt(raw, 10);
    setShow(!isFinite(ts) || (Date.now() - ts) > HIDE_FOR_MS);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setShow(false);
  };

  return (
    <div className="h-8 px-4 flex items-center justify-between border-b border-[#1c2550] bg-[#0e1430]/90 text-[11px] backdrop-blur-md">
      <div className="flex items-center gap-2 min-w-0">
        <span className="px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/40 text-violet-300 font-semibold tracking-wider text-[9px]">
          BETA
        </span>
        <span className="text-zinc-400 truncate">
          KeyShield <span className="font-mono text-zinc-300">{VERSION}</span>
          <span className="text-zinc-600"> · built {BUILD_DATE} · expect rough edges, please share feedback</span>
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <a
          href={BETA_FEEDBACK_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-violet-300 hover:text-violet-100 transition-colors"
        >
          <MessageCircle size={11} />
          Send feedback →
        </a>
        <button
          onClick={dismiss}
          className="text-zinc-500 hover:text-white transition-colors"
          title="Hide for 24 hours"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
};
