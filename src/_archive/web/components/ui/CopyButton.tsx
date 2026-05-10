/**
 * CopyButton — Clipboard copy with feedback
 */
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

export const CopyButton: React.FC<{ text: string; className?: string; size?: number }> = ({
  text,
  className = '',
  size = 12,
}) => {
  const { copied, copy } = useCopyable(text);
  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-[2px] border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <Check size={size} className="text-emerald-400" /> : <Copy size={size} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};
