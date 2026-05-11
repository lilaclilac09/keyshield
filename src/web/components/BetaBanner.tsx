import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { VERSION, BUILD_DATE, BETA_FEEDBACK_URL } from '../lib/version';

const STORAGE_KEY = 'ks_beta_banner_dismissed_at';
const HIDE_FOR_MS = 24 * 60 * 60 * 1000;

export const BetaBanner: React.FC = () => {
  const [show, setShow] = useState(false);
  useEffect(() => { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) { setShow(true); return; } const ts = parseInt(raw, 10); setShow(!isFinite(ts) || (Date.now() - ts) > HIDE_FOR_MS); }, []);
  if (!show) return null;
  const dismiss = () => { localStorage.setItem(STORAGE_KEY, String(Date.now())); setShow(false); };
  return (
    <div className="h-8 px-4 flex items-center justify-between border-b border-[#243365]/50 bg-[#0e1631] text-[11px]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="px-1.5 py-0.5 rounded-md bg-zinc-800 text-[#a8b3d8] font-semibold tracking-wider text-[9px] uppercase">Beta</span>
        <span className="text-[#8a96c2] truncate">KeyShield <span className="font-mono text-[#a8b3d8]">{VERSION}</span><span className="text-[#3e4a72]"> \xb7 built {BUILD_DATE}</span></span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <a href={BETA_FEEDBACK_URL} target="_blank" rel="noreferrer" className="text-[#8a96c2] hover:text-white transition-colors">Feedback \u2192</a>
        <button onClick={dismiss} className="text-[#5e6a91] hover:text-white transition-colors"><X size={12} /></button>
      </div>
    </div>
  );
};
