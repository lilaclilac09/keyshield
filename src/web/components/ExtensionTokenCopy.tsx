import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { getToken } from '../lib/auth';
import { copyWithFeedback, emitAppFeedback } from '../lib/app-feedback';

export const ExtensionTokenCopy: React.FC = () => {
  const token = getToken() ?? '';
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const copy = async () => {
    if (!token) {
      emitAppFeedback({ kind: 'error', title: 'Session token missing', source: 'copy' });
      return;
    }
    const ok = await copyWithFeedback(token);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (!token) return null;

  return (
    <div
      className="w-full rounded-xl border border-[#243365] bg-[#131c39] p-5"
      data-testid="extension-token-copy"
    >
      <p className="text-[16px] font-semibold text-white">Connect your extension</p>
      <p className="text-[14px] text-[#a8b3d8] mt-1.5 leading-relaxed">
        Load unpacked <strong className="text-white">v1.2.5 · latest</strong>. Sign-in on this tab
        should already show logged in. Stuck? Open the Docs & Troubleshooting tab.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {showToken && <code data-testid="extension-token-value" className="w-full break-all text-[12px] font-mono text-[#8a96c2] px-3 py-2 rounded-lg bg-[#020408] border border-[#131929]">{token}</code>}
        <button type="button" aria-expanded={showToken} onClick={() => setShowToken(!showToken)} className="h-11 px-4 rounded-xl border border-[#243365] text-white text-[14px] font-semibold">
          {showToken ? 'Hide token' : 'Show token'}
        </button>
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
