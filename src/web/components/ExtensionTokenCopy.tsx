import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { getToken } from '../lib/auth';

/** Session token on Home. Leftover 1.2.4 stamp trunks live on this page. */
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
      <p className="text-[16px] font-semibold text-white">Signed in — token is on this page</p>
      <p className="text-[14px] text-[#a8b3d8] mt-1.5 leading-relaxed">
        Load unpacked <strong className="text-white">v1.2.4</strong>. Sign-in on this tab
        should already show logged in. Stuck? Leftover 1.2.4 · missing session-bridge is on this page.
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
