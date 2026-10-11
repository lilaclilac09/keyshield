import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { getToken } from '../lib/auth';

/** Old unpacked 1.1.1 cannot receive KS_TOKEN from app.ks.aileena.xyz. */
export const ExtensionTokenCopy: React.FC = () => {
  const token = getToken() ?? '';
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be denied */
    }
  };

  if (!token) return null;

  return (
    <div
      className="w-full rounded-xl border border-[#243365] bg-[#131c39] p-5"
      data-testid="extension-token-copy"
    >
      <p className="text-[16px] font-semibold text-white">Chrome extension still says no token?</p>
      <p className="text-[14px] text-[#a8b3d8] mt-1.5 leading-relaxed">
        Do not edit <code className="text-white">~/Downloads/privacy_hack/keyshield</code>.
        That folder is on your Mac. Sign-in on the old 1.1.1 card opens dead{' '}
        <code className="text-white">keyshield.dev</code>. Copy this session token, then
        popup → <strong className="text-white">Register token</strong>.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="flex-1 min-w-0 text-[12px] font-mono truncate text-[#8a96c2] px-3 py-2 rounded-lg bg-[#020408] border border-[#131929]">
          {token.slice(0, 12)}…{token.slice(-6)}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="h-11 px-4 rounded-xl bg-white text-black text-[14px] font-semibold inline-flex items-center gap-2"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy token for extension'}
        </button>
      </div>
    </div>
  );
};
