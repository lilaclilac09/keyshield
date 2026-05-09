import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { VERSION, BUILD_DATE, BETA_FEEDBACK_URL } from "../shared/lib/version";

const STORAGE_KEY = 'ks_beta_banner_dismissed_at';
const HIDE_FOR_MS = 24 * 60 * 60 * 1000;

export const BetaBanner: React.FC = () => {
  const [show, setShow] = useState(false);
  useEffect(() => { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) { setShow(true); return; } const ts = parseInt(raw, 10); setShow(!isFinite(ts) || (Date.now() - ts) > HIDE_FOR_MS); }, []);
  if (!show) return null;
  const dismiss = () => { localStorage.setItem(STORAGE_KEY, String(Date.now())); setShow(false); };
  return (
    <div className="h-8 px-4 flex items-center justify-between border-b border-zinc-800/50 bg-[#050505] text-[11px]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="px-1.5 py-0.5 rounded-[1px] bg-zinc-800 text-zinc-400 font-semibold tracking-wider text-[9px] uppercase">Beta</span>
        <span className="text-zinc-500 truncate">KeyShield <span className="font-mono text-zinc-400">{VERSION}</span><span className="text-zinc-700"> \xb7 built {BUILD_DATE}</span></span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <a href={BETA_FEEDBACK_URL} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white transition-colors">Feedback \u2192</a>
        <button onClick={dismiss} className="text-zinc-600 hover:text-white transition-colors"><X size={12} /></button>
      </div>
    </div>
  );
};
