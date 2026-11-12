import React from 'react';
import { Bot } from 'lucide-react';
import { API_BASE, getToken, getWalletAddress } from '../lib/auth';
import { copyWithFeedback } from '../lib/app-feedback';
import { RevealField } from './ui/RevealField';

interface Props {
  onLogout: () => void;
}

/** Proxy-only agent session. Vault / Home / Sessions are owner-only (403). */
export const AgentSessionScreen: React.FC<Props> = ({ onLogout }) => {
  const token = getToken() ?? '';
  const pubkey = getWalletAddress() ?? '';
  const curl = `curl -sS ${API_BASE}/vproxy/openai/v1/models \\\n  -H "Authorization: Bearer ${token || '<TOKEN>'}"`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1226] px-6 py-12" data-testid="agent-session">
      <div className="w-full max-w-lg rounded-xl border border-[#243365]/50 bg-[#131c39] p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0e1631] border border-[#243365] flex items-center justify-center">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold text-white">Agent signed in</h1>
            <p className="text-[13px] text-[#a8b3d8]">Proxy-only session. This token cannot open the vault.</p>
          </div>
        </div>
        {pubkey && (
          <p className="text-[11px] font-mono text-[#8a96c2] break-all">pubkey {pubkey}</p>
        )}
        <RevealField value={token} label="Agent proxy token" autoHideSec={60} />
        <button
          type="button"
          data-testid="agent-session-copy"
          onClick={() => { void copyWithFeedback(token); }}
          className="w-full h-10 rounded-lg bg-white text-black text-[13px] font-semibold"
        >
          Copy agent token
        </button>
        <pre className="text-[11px] font-mono text-[#a8b3d8] bg-[#0e1631] border border-[#243365] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{curl}</pre>
        <p className="text-[12px] text-[#8a96c2] leading-relaxed">
          Next step: paste this token into your agent. Vault, billing, and key list need a human email or passkey sign-in.
        </p>
        <button
          type="button"
          data-testid="agent-session-logout"
          onClick={onLogout}
          className="w-full h-10 rounded-lg border border-zinc-500 text-white text-[13px] font-semibold"
        >
          Sign out
        </button>
      </div>
    </div>
  );
};
