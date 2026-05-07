import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function useCopyable(text: string, ms = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), ms);
    });
  };
  return { copied, copy };
}

export const CopyButton: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const { copied, copy } = useCopyable(text);
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
        copied
          ? 'border-emerald-800 bg-emerald-950/40 text-emerald-400'
          : 'border-[#1c2238] bg-[#070912] text-zinc-400 hover:text-white hover:border-[#2a3358]'
      } ${className}`}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};
