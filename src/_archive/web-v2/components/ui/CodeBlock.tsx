import React from 'react';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

export const CodeBlock: React.FC<{ code: string; lang?: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
  return (
    <div className="relative rounded-lg bg-[#020408] border border-[#131929] overflow-hidden">
      <div className="absolute top-2.5 right-2.5">
        <button onClick={copy} className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${copied ? 'border-emerald-800 text-emerald-400 bg-emerald-950/40' : 'border-[#1c2238] text-zinc-500 hover:text-white bg-[#070912]'}`}>
          {copied ? <Check size={10} /> : <Copy size={10} />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 text-[12px] leading-relaxed font-mono text-zinc-300 pr-16">{code}</pre>
    </div>
  );
};
