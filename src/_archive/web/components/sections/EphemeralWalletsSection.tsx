import React, { useState, useEffect, useCallback } from 'react';
import {
  Server, Plus, Trash2, RefreshCw, Loader2, AlertCircle, Check,
} from 'lucide-react';
import { apiFetch } from '../../lib/auth';
import { CopyButton } from '../ui/CopyButton';
import { ConfirmButton } from '../ui/ConfirmButton';

interface EphemeralWallet {
  agent_id: string;
  pubkey: string;
}

interface CreatedWallet {
  agent_id: string;
  pubkey: string;
}

export const EphemeralWalletsSection: React.FC = () => {
  const [wallets,      setWallets]      = useState<EphemeralWallet[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [agentIdInput, setAgentIdInput] = useState('');
  const [creating,     setCreating]     = useState(false);
  const [revokingId,   setRevokingId]   = useState<string | null>(null);
  const [created,      setCreated]      = useState<CreatedWallet | null>(null);
  const [err,          setErr]          = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/agents/wallets');
      if (r.ok) {
        const d = await r.json();
        setWallets(d.wallets ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const id = agentIdInput.trim();
    if (!id) return;
    setCreating(true); setErr(''); setCreated(null);
    try {
      const r = await apiFetch(`/agents/${encodeURIComponent(id)}/wallet/create`, {
        method: 'POST',
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.detail ?? 'Failed to create wallet'); return; }
      setCreated({ agent_id: d.agent_id, pubkey: d.pubkey });
      setAgentIdInput('');
      load();
    } catch { setErr('Network error'); }
    finally { setCreating(false); }
  };

  const handleRevoke = async (agentId: string) => {
    setRevokingId(agentId);
    try {
      await apiFetch(`/agents/${encodeURIComponent(agentId)}/wallet`, { method: 'DELETE' });
      setWallets(prev => prev.filter(w => w.agent_id !== agentId));
      if (created?.agent_id === agentId) setCreated(null);
    } catch { /* ignore */ }
    finally { setRevokingId(null); }
  };

  const truncatePubkey = (pk: string) =>
    pk.length > 24 ? `${pk.slice(0, 10)}…${pk.slice(-8)}` : pk;

  return (
    <div className="space-y-5 mt-5">
      {/* Header card */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
        <h3 className="text-[14px] font-medium text-white mb-2 flex items-center gap-2">
          <Server size={14} className="text-[#5b8cff]" /> Server-held Agent Wallets
        </h3>
        <p className="text-[12px] text-zinc-400">
          The server generates and holds an encrypted keypair for each agent. The agent uses its
          pubkey to sign x402 micropayments on-chain. Unlike user-registered agents, the private
          key never leaves the server — it is stored AES-256-GCM encrypted at rest.
        </p>
      </div>

      {/* Wallet list */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-white">Active server wallets</h3>
          <button onClick={load} className="text-zinc-500 hover:text-white transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading && (
          <div className="py-8 flex items-center justify-center gap-2 text-zinc-600">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[12px]">Loading…</span>
          </div>
        )}

        {!loading && wallets.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[13px] text-zinc-500">No server wallets yet.</p>
            <p className="text-[11px] text-zinc-700 mt-1">
              Create one below to let an agent sign x402 payments.
            </p>
          </div>
        )}

        {wallets.map(w => (
          <div
            key={w.agent_id}
            className="flex items-center gap-4 px-5 py-3.5 border-b border-[#0d1020] last:border-0"
          >
            <div className="w-8 h-8 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center shrink-0">
              <Server size={14} className="text-[#5b8cff]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-white font-medium truncate">{w.agent_id}</div>
              <div className="text-[11px] text-zinc-600 font-mono mt-0.5">
                {truncatePubkey(w.pubkey)}
              </div>
            </div>
            <CopyButton text={w.pubkey} />
            <ConfirmButton
              variant="destructive"
              onConfirm={() => handleRevoke(w.agent_id)}
              disabled={revokingId === w.agent_id}
              title="Revoke server wallet (click twice). This deletes the keypair permanently."
              confirmLabel="Confirm revoke"
              className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1"
            >
              {revokingId === w.agent_id
                ? <Loader2 size={12} className="animate-spin" />
                : <Trash2 size={12} />}
              <span>Revoke</span>
            </ConfirmButton>
          </div>
        ))}
      </div>

      {/* Create form */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-4">
        <h3 className="text-[13px] font-medium text-white">Create wallet for agent</h3>

        {err && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
            <AlertCircle size={13} className="text-rose-400 shrink-0" />
            <p className="text-[12px] text-rose-300">{err}</p>
          </div>
        )}

        {created && (
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-emerald-400">
              <Check size={12} />
              Wallet created for <span className="font-mono font-medium">{created.agent_id}</span>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 mb-1">Public key</div>
              <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-[#020408] border border-[#131929]">
                <code className="flex-1 text-[11px] font-mono text-emerald-300 break-all">
                  {created.pubkey}
                </code>
                <CopyButton text={created.pubkey} />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Agent ID</label>
            <input
              type="text"
              placeholder="e.g. trading-bot-v1"
              value={agentIdInput}
              onChange={e => { setAgentIdInput(e.target.value); setErr(''); setCreated(null); }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#5b8cff]/50"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !agentIdInput.trim()}
            className="mt-5 flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
};
