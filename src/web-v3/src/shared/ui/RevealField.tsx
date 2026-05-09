import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";

interface Props { value: string; label?: string; autoHideSec?: number; copyable?: boolean; className?: string; }

export const RevealField: React.FC<Props> = ({ value, label, autoHideSec = 30, copyable = true, className = '' }) => {
  const [revealed, setRevealed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const tickRef = useRef<number | null>(null);
  useEffect(() => () => { if (tickRef.current) window.clearInterval(tickRef.current); }, []);

  const reveal = () => { setRevealed(true); setTimeLeft(autoHideSec); if (tickRef.current) window.clearInterval(tickRef.current); tickRef.current = window.setInterval(() => { setTimeLeft(t => { if (t <= 1) { window.clearInterval(tickRef.current!); setRevealed(false); return 0; } return t - 1; }); }, 1000); };
  const hide = () => { if (tickRef.current) window.clearInterval(tickRef.current); setRevealed(false); setTimeLeft(0); };
  const copy = async () => { if (!value) return; await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const display = !value ? '\u2014 not set \u2014' : revealed ? value : '\u2022'.repeat(Math.min(value.length, 32));

  return (
    <div className={className}>
      {label && <p className="text-[12px] text-zinc-500 mb-2">{label}</p>}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#020408] border border-[#131929]">
        <code className={`flex-1 text-[12px] font-mono truncate ${revealed ? 'text-emerald-300' : 'text-zinc-500'}`}>{display}</code>
        {revealed && timeLeft > 0 && <span className="shrink-0 text-[10px] text-emerald-500/70 font-mono">hides in {timeLeft}s</span>}
        {value && (
          <button onClick={revealed ? hide : reveal} className="shrink-0 flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border border-[#1c2238] bg-[#070912] text-zinc-400 hover:text-white transition-colors" title={revealed ? 'Hide now' : `Reveal for ${autoHideSec}s`}>
            {revealed ? <EyeOff size={11} /> : <Eye size={11} />}{revealed ? 'Hide' : 'Reveal'}
          </button>
        )}
        {copyable && value && (
          <button onClick={copy} className={`shrink-0 flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${copied ? 'border-emerald-800 bg-emerald-950/40 text-emerald-400' : 'border-[#1c2238] bg-[#070912] text-zinc-400 hover:text-white'}`} title="Copy (auto-clears)">
            {copied ? <Check size={11} /> : <Copy size={11} />}{copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
};
