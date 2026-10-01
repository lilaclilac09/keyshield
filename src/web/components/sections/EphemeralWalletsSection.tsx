import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { apiFetch } from '../../lib/auth';

interface EphemeralWallet { agent_id: string; pubkey: string; }

export const EphemeralWalletsSection: React.FC<{ query?: string }> = ({ query = '' }) => {
  const [wallets, setWallets] = useState<EphemeralWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentIdInput, setAgentIdInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<EphemeralWallet | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => { setLoading(true); try { const r = await apiFetch('/agents/wallets'); if (r.ok) { const d = await r.json(); setWallets(d.wallets ?? []); } } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => { const id = agentIdInput.trim(); if (!id) return; setCreating(true); setErr(''); setCreated(null); try { const r = await apiFetch(`/agents/${encodeURIComponent(id)}/wallet/create`, { method: 'POST' }); const d = await r.json(); if (!r.ok) { setErr(d.detail ?? 'Failed'); return; } setCreated({ agent_id: d.agent_id, pubkey: d.pubkey }); setAgentIdInput(''); load(); } catch { setErr('Network error'); } finally { setCreating(false); } };

  const handleRevoke = async (agentId: string) => {
    setErr('');
    try {
      const r = await apiFetch(`/agents/${encodeURIComponent(agentId)}/wallet`, { method: 'DELETE' });
      if (!r.ok) { setErr('Could not revoke wallet'); return; }
      setWallets(prev => prev.filter(w => w.agent_id !== agentId));
      if (created?.agent_id === agentId) setCreated(null);
    } catch { setErr('Network error'); }
  };

  const q = query.trim().toLowerCase();
  const visible = wallets.filter(w => !q || w.agent_id.toLowerCase().includes(q) || w.pubkey.toLowerCase().includes(q));

  return (
    <div className="space-y-5 mt-5">
      <Card title="Server-Held Agent Wallets" description="The server generates and holds an encrypted keypair for each agent. The agent uses its pubkey to sign x402 micropayments on-chain.">
        {wallets.length === 0 && !loading && <p className="text-[12px] text-[#5e6a91] text-center py-4">No server wallets yet.</p>}
        {wallets.length > 0 && visible.length === 0 && <p className="text-[12px] text-[#5e6a91] text-center py-4">No wallets match “{query.trim()}”</p>}
        {visible.map(w => (
          <div key={w.agent_id} className="flex items-center gap-4 px-4 py-3 border-b border-[#243365]/30 last:border-0">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-[#243365] flex items-center justify-center shrink-0"><span className="text-[11px] font-mono text-white">W</span></div>
            <div className="flex-1 min-w-0"><div className="text-[13px] text-white font-medium truncate">{w.agent_id}</div><div className="text-[11px] text-[#5e6a91] font-mono mt-0.5">{w.pubkey.slice(0, 10)}\u2026{w.pubkey.slice(-8)}</div></div>
            <Button variant="destructive" size="sm" onClick={() => handleRevoke(w.agent_id)}>Revoke</Button>
          </div>
        ))}
      </Card>
      <Card title="Create Wallet for Agent">
        {err && <p className="text-[12px] text-red-400 mb-3">{err}</p>}
        {created && <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3 mb-3"><p className="text-[11px] text-emerald-400">Wallet created for <span className="font-mono font-medium">{created.agent_id}</span></p><code className="text-[11px] font-mono text-emerald-300 break-all">{created.pubkey}</code></div>}
        <div className="flex items-center gap-2"><div className="flex-1"><Input label="Agent ID" value={agentIdInput} onChange={e => { setAgentIdInput(e.target.value); setErr(''); setCreated(null); }} placeholder="trading-bot-v1" /></div><Button variant="primary" size="md" onClick={handleCreate} disabled={creating || !agentIdInput.trim()} loading={creating}>Create</Button></div>
      </Card>
    </div>
  );
};
