import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { apiFetch } from '../../lib/auth';
import { explorerTxUrl } from '../../lib/solana';

interface EphemeralWallet { agent_id: string; pubkey: string; }

interface PayResult { signature: string; streamPda: string; }

/** Per-wallet inline pay_x402 form — spec 10 Phase 10.7.
 *
 * POSTs the x402 envelope to /agents/{id}/wallet/pay_x402; the backend
 * signs the on-chain pay_x402 ix (#25) with the server-held keypair and
 * returns the tx signature (= the X-Payment-Proof value). The asset is
 * intentionally omitted so the backend uses its configured USDC mint. */
const PayX402Form: React.FC<{ agentId: string; onClose: () => void }> = ({ agentId, onClose }) => {
  const [payTo, setPayTo] = useState('');
  const [amount, setAmount] = useState('1000');
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<PayResult | null>(null);

  const handlePay = async () => {
    const micro = Number.parseInt(amount, 10);
    if (!payTo.trim() || !Number.isFinite(micro) || micro <= 0) { setErr('Recipient and a positive micro-USDC amount are required'); return; }
    setPaying(true); setErr(''); setResult(null);
    try {
      const r = await apiFetch(`/agents/${encodeURIComponent(agentId)}/wallet/pay_x402`, {
        method: 'POST',
        body: JSON.stringify({
          envelope: {
            network: 'solana-devnet',
            amountRequired: micro,
            payTo: payTo.trim(),
            resource: 'dashboard-test-payment',
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        // Backend returns actionable `detail` strings for every failure
        // mode (no stream = 409, config missing = 503, cap = 402, …).
        setErr(d.detail ?? d.error ?? `Payment failed (${r.status})`);
        return;
      }
      setResult({ signature: d.signature, streamPda: d.streamPda });
    } catch { setErr('Network error'); } finally { setPaying(false); }
  };

  return (
    <div className="mt-2 rounded-lg border border-[#243365]/60 bg-zinc-950/40 p-3 space-y-3">
      {result ? (
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
          <p className="text-[11px] text-emerald-400 mb-1">x402 payment confirmed on-chain</p>
          <a href={explorerTxUrl(result.signature)} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-emerald-300 break-all hover:underline">{result.signature}</a>
          <p className="text-[10px] text-[#5e6a91] mt-1 font-mono">stream {result.streamPda.slice(0, 8)}…{result.streamPda.slice(-8)}</p>
        </div>
      ) : (
        <>
          {err && <p className="text-[11px] text-red-400">{err}</p>}
          <Input label="Pay to (base58 wallet)" monospace value={payTo} onChange={e => { setPayTo(e.target.value); setErr(''); }} placeholder="GHpd6gfZ…" />
          <Input label="Amount (micro-USDC)" value={amount} onChange={e => { setAmount(e.target.value); setErr(''); }} placeholder="1000" />
          <p className="text-[10px] text-[#5e6a91]">Signs a pay_x402 ix (#25) with this agent's server-held key. Debits the agent's open payment stream; the on-chain budget cap applies.</p>
        </>
      )}
      <div className="flex items-center gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
        {!result && <Button variant="primary" size="sm" onClick={handlePay} disabled={paying || !payTo.trim()} loading={paying}>Pay</Button>}
      </div>
    </div>
  );
};

export const EphemeralWalletsSection: React.FC = () => {
  const [wallets, setWallets] = useState<EphemeralWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentIdInput, setAgentIdInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<EphemeralWallet | null>(null);
  const [err, setErr] = useState('');
  const [payingFor, setPayingFor] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); try { const r = await apiFetch('/agents/wallets'); if (r.ok) { const d = await r.json(); setWallets(d.wallets ?? []); } } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => { const id = agentIdInput.trim(); if (!id) return; setCreating(true); setErr(''); setCreated(null); try { const r = await apiFetch(`/agents/${encodeURIComponent(id)}/wallet/create`, { method: 'POST' }); const d = await r.json(); if (!r.ok) { setErr(d.detail ?? 'Failed'); return; } setCreated({ agent_id: d.agent_id, pubkey: d.pubkey }); setAgentIdInput(''); load(); } catch { setErr('Network error'); } finally { setCreating(false); } };

  const handleRevoke = async (agentId: string) => {
    if (!window.confirm(`Delete the server-held key for "${agentId}"? This is permanent — the agent can no longer sign x402 payments. Stream funds stay withdrawable by you.`)) return;
    setRevoking(agentId);
    try {
      const r = await apiFetch(`/agents/${encodeURIComponent(agentId)}/wallet`, { method: 'DELETE' });
      if (r.ok) { if (payingFor === agentId) setPayingFor(null); load(); }
    } catch {} finally { setRevoking(null); }
  };

  return (
    <div className="space-y-5 mt-5">
      <Card title="Server-Held Agent Wallets" description="The server generates and holds an encrypted keypair for each agent. The agent uses its pubkey to sign x402 micropayments on-chain.">
        {wallets.length === 0 && !loading && <p className="text-[12px] text-[#5e6a91] text-center py-4">No server wallets yet.</p>}
        {wallets.map(w => (
          <div key={w.agent_id} className="px-4 py-3 border-b border-[#243365]/30 last:border-0">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-[#243365] flex items-center justify-center shrink-0"><span className="text-[11px] font-mono text-white">W</span></div>
              <div className="flex-1 min-w-0"><div className="text-[13px] text-white font-medium truncate">{w.agent_id}</div><div className="text-[11px] text-[#5e6a91] font-mono mt-0.5">{w.pubkey.slice(0, 10)}…{w.pubkey.slice(-8)}</div></div>
              <Button variant="secondary" size="sm" onClick={() => setPayingFor(payingFor === w.agent_id ? null : w.agent_id)}>Pay x402</Button>
              <Button variant="destructive" size="sm" onClick={() => handleRevoke(w.agent_id)} disabled={revoking === w.agent_id} loading={revoking === w.agent_id}>Revoke</Button>
            </div>
            {payingFor === w.agent_id && <PayX402Form agentId={w.agent_id} onClose={() => setPayingFor(null)} />}
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
