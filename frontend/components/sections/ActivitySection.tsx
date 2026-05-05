import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, DollarSign, CreditCard, TrendingUp, Activity, RefreshCw, Loader2, Zap,
  Radio, Plus, X, Power,
} from 'lucide-react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import { API_BASE, apiFetch, getToken } from '../../lib/auth';
import { relTime } from '../../lib/time';

const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
);

interface UsageEntry {
  id:          number;
  upstream:    string;
  key_type:    string;   // 'self_custodian' | 'platform'
  method:      string;
  path:        string;
  tokens_in:   number;
  tokens_out:  number;
  cost_usd:    number;
  latency_ms:  number;
  status_code: number;
  ts:          number;   // unix seconds
}

interface UsageStat {
  upstream:    string;
  key_type:    string;
  calls:       number;
  tokens_in:   number;
  tokens_out:  number;
  cost_usd:    number;
  avg_latency: number;
  last_used:   number;
}

interface BillingInfo {
  balance_usd:      number;
  total_spent_usd:  number;
  free_credit_usd:  number;
}

interface MppStream {
  id:                          number;
  agent_pubkey:                string;
  agent_name:                  string;
  upstream:                    string;
  rate_per_call_micro_usdc:    number;
  rate_per_token_micro_usdc:   number;
  settlement_interval_secs:    number;
  status:                      string;          // 'open' | 'closed'
  opened_at:                   number;
  last_settled_at:             number;
  closed_at:                   number | null;
  total_calls:                 number;
  total_tokens:                number;
  pending_micro_usdc:          number;
  settled_micro_usdc:          number;
}

interface MppSummary {
  streams_total:   number;
  streams_open:    number;
  tokens_total:    number;
  calls_total:     number;
  settled_usd:     number;
  pending_usd:     number;
}

interface MppEvent {
  id:           number;
  stream_id:    number;
  kind:         string;   // 'open' | 'record' | 'settle' | 'close'
  calls:        number;
  tokens:       number;
  micro_usdc:   number;
  cost_usd:     number;
  ts:           number;
  upstream:     string;
  agent_name:   string;
  agent_pubkey: string;
}

const MPP_UPSTREAMS = [
  'openai', 'anthropic', 'groq', 'mistral', 'cohere',
  'helius', '0x', 'titan', 'pyth', 'alchemy',
];

const microUsdcToUsd = (micro: number): string => `$${(micro / 1_000_000).toFixed(6)}`;
const shortPub = (pk: string): string =>
  pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;

function upstreamColor(upstream: string): string {
  const map: Record<string, string> = {
    openai:    'text-green-400',
    anthropic: 'text-orange-400',
    groq:      'text-yellow-400',
    mistral:   'text-blue-400',
    cohere:    'text-purple-400',
    helius:    'text-[#5b8cff]',
    '0x':      'text-pink-400',
    alchemy:   'text-cyan-400',
    pyth:      'text-violet-400',
    titan:     'text-rose-400',
  };
  return map[upstream] ?? 'text-zinc-400';
}

const KeyTypeBadge: React.FC<{ keyType: string }> = ({ keyType }) =>
  keyType === 'self_custodian' ? (
    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 shrink-0">
      <Shield size={8} /> SELF
    </span>
  ) : (
    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-900/50 text-amber-400 shrink-0">
      <DollarSign size={8} /> PLATFORM
    </span>
  );

export const ActivitySection: React.FC = () => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [history, setHistory]     = useState<UsageEntry[]>([]);
  const [stats, setStats]         = useState<UsageStat[]>([]);
  const [billing, setBilling]     = useState<BillingInfo | null>(null);
  const [loading, setLoading]     = useState(true);
  const [topupAmt, setTopupAmt]   = useState('');
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupMsg, setTopupMsg]   = useState('');
  const [topupOk, setTopupOk]     = useState(false);

  // ── MPP state ──────────────────────────────────────────────────────────────
  const [mppStreams, setMppStreams]     = useState<MppStream[]>([]);
  const [mppSummary, setMppSummary]     = useState<MppSummary | null>(null);
  const [mppEvents,  setMppEvents]      = useState<MppEvent[]>([]);
  const [mppOpenForm, setMppOpenForm]   = useState(false);
  const [mppBusyId,  setMppBusyId]      = useState<number | null>(null);
  const [mppMsg,     setMppMsg]         = useState('');
  const [mppForm,    setMppForm]        = useState({
    agentPubkey:           '',
    agentName:             '',
    upstream:              'anthropic',
    ratePerToken:          '15',
    ratePerCall:           '0',
    settlementInterval:    '60',
  });
  // tick once a second so the "next settle in X" countdown updates live
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const load = useCallback(async () => {
    try {
      const [hRes, sRes, bRes, mRes, mEvRes] = await Promise.all([
        apiFetch('/usage/history?limit=30'),
        apiFetch('/usage/stats'),
        apiFetch('/billing/balance'),
        apiFetch('/mpp/streams'),
        apiFetch('/mpp/events?limit=20'),
      ]);
      if (hRes.ok) { const d = await hRes.json(); setHistory(d.history ?? []); }
      if (sRes.ok) { const d = await sRes.json(); setStats(d.stats ?? []); }
      if (bRes.ok) { setBilling(await bRes.json()); }
      if (mRes.ok) {
        const d = await mRes.json();
        setMppStreams(d.streams ?? []);
        setMppSummary(d.summary ?? null);
      }
      if (mEvRes.ok) { const d = await mEvRes.json(); setMppEvents(d.events ?? []); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // ── MPP actions ─────────────────────────────────────────────────────────────
  const handleMppOpen = async () => {
    setMppMsg('');
    const ratePerToken = parseInt(mppForm.ratePerToken || '0', 10);
    const ratePerCall  = parseInt(mppForm.ratePerCall  || '0', 10);
    const interval     = parseInt(mppForm.settlementInterval || '60', 10);
    if (!mppForm.agentPubkey.trim()) { setMppMsg('Agent pubkey required'); return; }
    if (ratePerToken === 0 && ratePerCall === 0) {
      setMppMsg('Set rate per token or rate per call'); return;
    }
    try {
      const r = await apiFetch('/mpp/streams', {
        method: 'POST',
        body: JSON.stringify({
          agentPubkey:            mppForm.agentPubkey.trim(),
          agentName:              mppForm.agentName.trim(),
          upstream:               mppForm.upstream,
          ratePerTokenMicroUsdc:  ratePerToken,
          ratePerCallMicroUsdc:   ratePerCall,
          settlementIntervalSecs: interval,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setMppMsg(d.detail ?? 'Failed to open stream'); return; }
      setMppMsg(`Stream #${d.stream.id} open · auto-settle every ${d.stream.settlement_interval_secs}s`);
      setMppOpenForm(false);
      setMppForm({ ...mppForm, agentPubkey: '', agentName: '' });
      load();
    } catch { setMppMsg('Network error'); }
  };

  const handleMppRecord = async (id: number, tokens: number) => {
    setMppBusyId(id); setMppMsg('');
    try {
      const r = await apiFetch(`/mpp/streams/${id}/record`, {
        method: 'POST',
        body: JSON.stringify({ tokens, calls: 1 }),
      });
      const d = await r.json();
      if (!r.ok) { setMppMsg(d.detail ?? 'Record failed'); return; }
      const justSettled = d.stream.just_settled_micro_usdc as number | undefined;
      if (justSettled && justSettled > 0) {
        setMppMsg(`Recorded ${tokens} tok · auto-settled ${microUsdcToUsd(justSettled)}`);
      } else {
        setMppMsg(`Recorded ${tokens} tok on stream #${id}`);
      }
      load();
    } catch { setMppMsg('Network error'); }
    finally { setMppBusyId(null); }
  };

  const handleMppSettle = async (id: number) => {
    setMppBusyId(id); setMppMsg('');
    try {
      const r = await apiFetch(`/mpp/streams/${id}/settle`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { setMppMsg(d.detail ?? 'Settle failed'); return; }
      const just = d.stream.just_settled_micro_usdc as number | undefined;
      setMppMsg(just && just > 0
        ? `Settled ${microUsdcToUsd(just)} on stream #${id}`
        : `Stream #${id} had nothing pending`);
      load();
    } catch { setMppMsg('Network error'); }
    finally { setMppBusyId(null); }
  };

  const handleMppClose = async (id: number) => {
    setMppBusyId(id); setMppMsg('');
    try {
      const r = await apiFetch(`/mpp/streams/${id}/close`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { setMppMsg(d.detail ?? 'Close failed'); return; }
      setMppMsg(`Stream #${id} closed`);
      load();
    } catch { setMppMsg('Network error'); }
    finally { setMppBusyId(null); }
  };

  const handleTopup = async () => {
    const amount = parseFloat(topupAmt);
    if (!amount || amount <= 0) return;
    if (!publicKey || !sendTransaction) {
      setTopupOk(false);
      setTopupMsg('Connect your Solana wallet first.');
      return;
    }

    setTopupBusy(true);
    setTopupOk(false);
    setTopupMsg('Getting price quote…');

    try {
      // 1. Quote — auth token gives us a server-issued memo so the
      //    on-chain transfer is bound to this user (anti-replay).
      const token = getToken();
      const quoteRes = await fetch(
        `${API_BASE}/billing/sol-quote?amount_usd=${amount}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );
      if (!quoteRes.ok) {
        const err = await quoteRes.json().catch(() => ({}));
        throw new Error(err.detail ?? `quote failed (HTTP ${quoteRes.status})`);
      }
      const quote = await quoteRes.json() as {
        amount_lamports: number;
        amount_sol:      number;
        sol_usd_price:   number;
        payment_address: string;
        memo?:           string;
      };

      // 2. Build SystemProgram.transfer + optional memo, sign + send.
      setTopupMsg(`Approve ${quote.amount_sol.toFixed(4)} SOL transfer in wallet…`);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey:   new PublicKey(quote.payment_address),
          lamports:   quote.amount_lamports,
        }),
      );
      if (quote.memo) {
        tx.add(new TransactionInstruction({
          programId: MEMO_PROGRAM_ID,
          keys:      [],
          data:      Buffer.from(quote.memo, 'utf8'),
        }));
      }
      const sig = await sendTransaction(tx, connection);

      // 3. Wait for confirmed before asking the server to verify.
      setTopupMsg('Waiting for Solana confirmation…');
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, ...latest },
        'confirmed',
      );

      // 4. Server verifies on-chain and credits the balance.
      setTopupMsg('Verifying on-chain…');
      const credit = await apiFetch('/billing/topup-solana', {
        method: 'POST',
        body: JSON.stringify({
          tx_signature:        sig,
          expected_amount_usd: amount,
          ...(quote.memo ? { memo: quote.memo } : {}),
        }),
      });
      const d = await credit.json().catch(() => ({}));
      if (!credit.ok) {
        throw new Error(d.detail ?? `credit failed (HTTP ${credit.status})`);
      }
      setTopupOk(true);
      setTopupMsg(
        `Credited $${d.credited_usd.toFixed(4)} · new balance $${d.balance_usd.toFixed(4)}`,
      );
      setTopupAmt('');
      load();
    } catch (e: unknown) {
      setTopupOk(false);
      const msg = e instanceof Error ? e.message : 'Topup failed';
      setTopupMsg(msg);
    } finally {
      setTopupBusy(false);
    }
  };

  const totalCalls    = stats.reduce((a, s) => a + s.calls, 0);
  const totalCost     = stats.reduce((a, s) => a + s.cost_usd, 0);
  const platformCalls = stats.filter(s => s.key_type === 'platform').reduce((a, s) => a + s.calls, 0);
  const selfCalls     = stats.filter(s => s.key_type === 'self_custodian').reduce((a, s) => a + s.calls, 0);

  return (
    <div className="space-y-5">

      {/* ── Billing balance card ─────────────────────────────────────────── */}
      {billing && (
        <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
              <CreditCard size={14} className="text-[#5b8cff]" /> Billing
            </h3>
            <span className="text-[11px] text-zinc-600">resets never · x402 payments accepted</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-4 py-3 text-center">
              <div className="text-[11px] text-emerald-500 mb-1">Prepaid balance</div>
              <div className={`text-[22px] font-semibold ${billing.balance_usd <= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                ${billing.balance_usd.toFixed(4)}
              </div>
            </div>
            <div className="rounded-xl border border-[#1c2238] bg-[#070912] px-4 py-3 text-center">
              <div className="text-[11px] text-zinc-500 mb-1">Platform key spend</div>
              <div className="text-[22px] font-semibold text-white">${totalCost.toFixed(4)}</div>
            </div>
            <div className="rounded-xl border border-[#1c2238] bg-[#070912] px-4 py-3 text-center">
              <div className="text-[11px] text-zinc-500 mb-1">Free credit</div>
              <div className="text-[22px] font-semibold text-zinc-300">${billing.free_credit_usd.toFixed(2)}</div>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 px-4 py-3 mb-4 flex items-start gap-3">
            <Shield size={14} className="text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] text-emerald-300 font-medium">Your self-custodian keys are free to proxy</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                When you store your own API key in the vault, KeyShield injects it zero-cost.
                Billing only applies when you use KeyShield's platform keys (no vault key stored).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                type="number"
                min="0.01"
                max="10"
                step="0.01"
                value={topupAmt}
                onChange={e => setTopupAmt(e.target.value)}
                placeholder="Amount (USD)"
                className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#5b8cff]/50"
              />
            </div>
            <button
              onClick={handleTopup}
              disabled={topupBusy || !topupAmt || !publicKey}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
            >
              {topupBusy ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {publicKey ? 'Top up with SOL' : 'Connect wallet to top up'}
            </button>
          </div>
          {topupMsg && (
            <p className={`text-[11px] mt-2 ${topupOk ? 'text-emerald-400' : topupBusy ? 'text-zinc-400' : 'text-rose-400'}`}>
              {topupMsg}
            </p>
          )}
          <p className="text-[10px] text-zinc-600 mt-2">
            On-chain SOL transfer on Solana · verified via Helius RPC + Pyth · MPP streaming live below
          </p>
        </div>
      )}

      {/* ── MPP — Metered Payment streams ────────────────────────────────── */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        {/* Phase 10.4 stub-on-chain banner. Off-chain CRUD works end-to-end
            (open / record / settle / close persist in SQLite). On-chain ix
            submission is partial: `mpp_settle` (#26) is wired through
            v2-mvp/src/mpp_onchain.py + falls back to stub when env unset.
            `open_payment_stream` (#24) and `withdraw_agent_wallet` (#27)
            have server-side ix builders + /mpp/streams/{id}/build-{open,
            withdraw}-tx endpoints; remaining work is the wallet-adapter
            sign+submit UI. See ROADMAP P0a + spec 10. */}
        <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-300">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 font-bold">!</span>
          <span>
            <strong className="text-amber-200">Beta — wallet sign-off pending</strong>
            <span className="text-amber-300/70"> · Off-chain CRUD live. <code className="text-amber-200">mpp_settle</code> on-chain via <code className="text-amber-200">KS_MPP_SETTLER_KEY</code>; <code className="text-amber-200">open</code> / <code className="text-amber-200">withdraw</code> need wallet-adapter sign UI (server endpoints ready).</span>
          </span>
        </div>
        <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
              <Radio size={13} className="text-[#5b8cff]" /> MPP streams
              <span className="text-[10px] text-zinc-600 font-normal">
                Metered Payment Protocol · auto-settle micro-USDC
              </span>
            </h3>
            {mppSummary && (
              <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1">
                <span>
                  <span className="text-emerald-400">{mppSummary.streams_open}</span> open
                  {' · '}{mppSummary.streams_total} total
                </span>
                <span>
                  <span className="text-white">{mppSummary.calls_total.toLocaleString()}</span> calls ·
                  <span className="text-white"> {mppSummary.tokens_total.toLocaleString()}</span> tokens
                </span>
                <span>
                  settled <span className="text-emerald-400">${mppSummary.settled_usd.toFixed(6)}</span>
                  {mppSummary.pending_usd > 0 && (
                    <> · pending <span className="text-amber-400">${mppSummary.pending_usd.toFixed(6)}</span></>
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setMppOpenForm(v => !v); setMppMsg(''); }}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md bg-[#0e1430] border border-[#1c2550] text-[#5b8cff] hover:bg-[#11183a] transition-colors"
            >
              {mppOpenForm ? <X size={11} /> : <Plus size={11} />}
              {mppOpenForm ? 'Cancel' : 'Open stream'}
            </button>
            <button onClick={load} className="text-zinc-500 hover:text-white transition-colors">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Open-stream form */}
        {mppOpenForm && (
          <div className="px-5 py-4 border-b border-[#141a2e] bg-[#070912] space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Agent pubkey (base58)</label>
                <input
                  type="text"
                  value={mppForm.agentPubkey}
                  onChange={e => setMppForm({ ...mppForm, agentPubkey: e.target.value })}
                  placeholder="9WzDXwBbmkg..."
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2.5 py-1.5 text-[12px] font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#5b8cff]/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Agent name (optional)</label>
                <input
                  type="text"
                  value={mppForm.agentName}
                  onChange={e => setMppForm({ ...mppForm, agentName: e.target.value })}
                  placeholder="trading-bot-v1"
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2.5 py-1.5 text-[12px] text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#5b8cff]/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Upstream</label>
                <select
                  value={mppForm.upstream}
                  onChange={e => setMppForm({ ...mppForm, upstream: e.target.value })}
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#5b8cff]/50"
                >
                  {MPP_UPSTREAMS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">µUSDC / token</label>
                <input
                  type="number" min="0"
                  value={mppForm.ratePerToken}
                  onChange={e => setMppForm({ ...mppForm, ratePerToken: e.target.value })}
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2 py-1.5 text-[12px] font-mono text-white focus:outline-none focus:border-[#5b8cff]/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">µUSDC / call</label>
                <input
                  type="number" min="0"
                  value={mppForm.ratePerCall}
                  onChange={e => setMppForm({ ...mppForm, ratePerCall: e.target.value })}
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2 py-1.5 text-[12px] font-mono text-white focus:outline-none focus:border-[#5b8cff]/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Settle every (s)</label>
                <input
                  type="number" min="5" max="3600"
                  value={mppForm.settlementInterval}
                  onChange={e => setMppForm({ ...mppForm, settlementInterval: e.target.value })}
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2 py-1.5 text-[12px] font-mono text-white focus:outline-none focus:border-[#5b8cff]/50"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-zinc-600">
                1 µUSDC = $0.000001 · 15 µUSDC/tok ≈ $0.015 per 1k tokens
              </p>
              <button
                onClick={handleMppOpen}
                className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md bg-[#5b8cff] hover:bg-[#7aa1ff] text-white font-medium transition-colors"
              >
                <Zap size={11} /> Open stream
              </button>
            </div>
          </div>
        )}

        {/* Stream list */}
        {mppStreams.length === 0 && !mppOpenForm && (
          <div className="py-10 text-center">
            <p className="text-[13px] text-zinc-500">No MPP streams yet</p>
            <p className="text-[11px] text-zinc-700 mt-1 max-w-md mx-auto">
              Open a metered channel for a long-running agent. Calls record usage locally
              and the server auto-settles micro-USDC every interval — no per-call HTTP 402.
            </p>
          </div>
        )}

        {mppStreams.length > 0 && (
          <div className="divide-y divide-[#0d1020]">
            {mppStreams.map(s => {
              const isOpen      = s.status === 'open';
              const elapsed     = now - s.last_settled_at;
              const nextIn      = Math.max(0, s.settlement_interval_secs - elapsed);
              const intervalPct = Math.min(100, (elapsed / s.settlement_interval_secs) * 100);
              return (
                <div key={s.id} className="px-5 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                    }`} />
                    <span className="text-[11px] font-mono text-zinc-500 w-8 shrink-0">#{s.id}</span>
                    <span className={`text-[12px] font-mono font-medium ${upstreamColor(s.upstream)} w-20 shrink-0`}>
                      {s.upstream}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-white truncate">
                        {s.agent_name || <span className="text-zinc-500">unnamed agent</span>}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-600 truncate" title={s.agent_pubkey}>
                        {shortPub(s.agent_pubkey)}
                      </div>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                      isOpen
                        ? 'bg-emerald-950/50 border border-emerald-900/50 text-emerald-400'
                        : 'bg-zinc-900/50 border border-zinc-800 text-zinc-500'
                    }`}>
                      {s.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-3 pl-7">
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Rate</div>
                      <div className="text-[11px] font-mono text-zinc-300">
                        {s.rate_per_token_micro_usdc > 0 && <>{s.rate_per_token_micro_usdc} µ/tok</>}
                        {s.rate_per_call_micro_usdc > 0 && (
                          <>{s.rate_per_token_micro_usdc > 0 ? ' · ' : ''}{s.rate_per_call_micro_usdc} µ/call</>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Calls</div>
                      <div className="text-[11px] font-mono text-white">{s.total_calls.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Tokens</div>
                      <div className="text-[11px] font-mono text-white">{s.total_tokens.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Settled</div>
                      <div className="text-[11px] font-mono text-emerald-400">
                        ${(s.settled_micro_usdc / 1_000_000).toFixed(6)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Pending</div>
                      <div className={`text-[11px] font-mono ${s.pending_micro_usdc > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        ${(s.pending_micro_usdc / 1_000_000).toFixed(6)}
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="pl-7 flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[10px] text-zinc-600 mb-1">
                          <span>Next auto-settle</span>
                          <span className="font-mono">
                            {nextIn > 0 ? `in ${nextIn}s` : 'on next record'}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-[#070912] overflow-hidden">
                          <div
                            className="h-full bg-[#5b8cff] transition-all"
                            style={{ width: `${intervalPct}%` }}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => handleMppRecord(s.id, 100)}
                        disabled={mppBusyId === s.id}
                        title="Simulate recording 100 tokens of usage"
                        className="text-[10px] px-2 py-1 rounded border border-[#1c2238] text-zinc-400 hover:text-white hover:border-[#1c2550] disabled:opacity-50"
                      >
                        +100 tok
                      </button>
                      <button
                        onClick={() => handleMppSettle(s.id)}
                        disabled={mppBusyId === s.id}
                        className="text-[10px] px-2 py-1 rounded border border-emerald-900/50 text-emerald-400 hover:bg-emerald-950/30 disabled:opacity-50"
                      >
                        {mppBusyId === s.id ? <Loader2 size={10} className="animate-spin inline" /> : 'Settle now'}
                      </button>
                      <button
                        onClick={() => handleMppClose(s.id)}
                        disabled={mppBusyId === s.id}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-rose-900/50 text-rose-400 hover:bg-rose-950/30 disabled:opacity-50"
                      >
                        <Power size={9} /> Close
                      </button>
                    </div>
                  )}

                  {!isOpen && s.closed_at && (
                    <div className="pl-7 text-[10px] text-zinc-600">
                      Closed {relTime(s.closed_at)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {mppMsg && (
          <div className="px-5 py-2 border-t border-[#141a2e]">
            <p className={`text-[11px] ${
              mppMsg.includes('failed') || mppMsg.includes('error') || mppMsg.includes('required')
                ? 'text-rose-400'
                : 'text-emerald-400'
            }`}>{mppMsg}</p>
          </div>
        )}

        {mppEvents.length > 0 && (
          <details className="border-t border-[#141a2e]">
            <summary className="px-5 py-2.5 cursor-pointer text-[11px] text-zinc-500 hover:text-white select-none">
              Recent stream events · {mppEvents.length}
            </summary>
            <div className="divide-y divide-[#0d1020] max-h-64 overflow-y-auto">
              {mppEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 px-5 py-2 text-[11px]">
                  <span className={`w-14 shrink-0 font-mono ${
                    ev.kind === 'open'   ? 'text-emerald-400' :
                    ev.kind === 'settle' ? 'text-[#5b8cff]'   :
                    ev.kind === 'close'  ? 'text-rose-400'    :
                                           'text-zinc-400'
                  }`}>{ev.kind}</span>
                  <span className="font-mono text-zinc-500 w-8 shrink-0">#{ev.stream_id}</span>
                  <span className={`font-mono w-16 shrink-0 ${upstreamColor(ev.upstream)}`}>{ev.upstream}</span>
                  <span className="flex-1 min-w-0 truncate text-zinc-500">
                    {ev.kind === 'record' && `${ev.tokens.toLocaleString()} tok / ${ev.calls} call`}
                    {ev.kind === 'settle' && `settled ${microUsdcToUsd(ev.micro_usdc)}`}
                    {ev.kind === 'open'   && (ev.agent_name ? `agent ${ev.agent_name}` : 'stream opened')}
                    {ev.kind === 'close'  && 'stream closed'}
                  </span>
                  {ev.micro_usdc > 0 && (
                    <span className="text-zinc-500 shrink-0 font-mono">
                      {microUsdcToUsd(ev.micro_usdc)}
                    </span>
                  )}
                  <span className="text-zinc-700 shrink-0 w-14 text-right">{relTime(ev.ts)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ── Usage stats table ────────────────────────────────────────────── */}
      {stats.length > 0 && (
        <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
              <TrendingUp size={13} className="text-[#5b8cff]" /> Usage by provider
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
              <span>{selfCalls} self-custodian · {platformCalls} platform</span>
              <span>{totalCalls} total calls</span>
            </div>
          </div>
          <div className="divide-y divide-[#0d1020]">
            {stats.map((s, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3">
                <div className="w-24 shrink-0">
                  <span className={`text-[12px] font-mono font-medium ${upstreamColor(s.upstream)}`}>
                    {s.upstream}
                  </span>
                </div>
                <KeyTypeBadge keyType={s.key_type} />
                <div className="flex-1 grid grid-cols-4 gap-4 text-right">
                  <div>
                    <div className="text-[12px] text-white">{s.calls.toLocaleString()}</div>
                    <div className="text-[10px] text-zinc-600">calls</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-white">{(s.tokens_in + s.tokens_out).toLocaleString()}</div>
                    <div className="text-[10px] text-zinc-600">tokens</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-white">{s.avg_latency}ms</div>
                    <div className="text-[10px] text-zinc-600">avg latency</div>
                  </div>
                  <div>
                    <div className={`text-[12px] ${s.key_type === 'platform' ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {s.key_type === 'self_custodian' ? 'FREE' : `$${s.cost_usd.toFixed(4)}`}
                    </div>
                    <div className="text-[10px] text-zinc-600">cost</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Activity feed ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
            <Activity size={13} className="text-[#5b8cff]" /> Proxy call log
          </h3>
          <button onClick={load} className="text-zinc-500 hover:text-white transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading && history.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin text-zinc-600" />
          </div>
        )}

        {!loading && history.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-[13px] text-zinc-500">No proxy calls yet</p>
            <p className="text-[11px] text-zinc-700 mt-1">
              Calls appear here the moment an agent or SDK uses your proxy URL
            </p>
          </div>
        )}

        {history.length > 0 && (
          <div className="divide-y divide-[#0d1020]">
            {history.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  e.status_code < 300 ? 'bg-emerald-400' :
                  e.status_code < 400 ? 'bg-yellow-400' : 'bg-rose-400'
                }`} />
                <span className={`text-[11px] font-mono w-16 shrink-0 ${upstreamColor(e.upstream)}`}>
                  {e.upstream}
                </span>
                <KeyTypeBadge keyType={e.key_type} />
                <code className="flex-1 text-[11px] text-zinc-500 truncate min-w-0">
                  {e.method} /{e.path}
                </code>
                {(e.tokens_in > 0 || e.tokens_out > 0) && (
                  <span className="text-[10px] text-zinc-600 shrink-0">
                    {e.tokens_in}↑ {e.tokens_out}↓ tok
                  </span>
                )}
                <span className={`text-[11px] shrink-0 w-16 text-right ${
                  e.key_type === 'self_custodian' ? 'text-emerald-400' :
                  e.cost_usd > 0 ? 'text-amber-400' : 'text-zinc-600'
                }`}>
                  {e.key_type === 'self_custodian' ? 'FREE' :
                   e.cost_usd > 0 ? `$${e.cost_usd.toFixed(5)}` : '—'}
                </span>
                <span className="text-[10px] text-zinc-600 shrink-0 w-12 text-right">
                  {e.latency_ms > 0 ? `${Math.round(e.latency_ms)}ms` : '—'}
                </span>
                <span className="text-[10px] text-zinc-700 shrink-0 w-14 text-right">
                  {relTime(e.ts)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <p className="text-[10px] text-zinc-700 text-center">
          Showing last {history.length} calls · auto-refreshes every 30s
        </p>
      )}
    </div>
  );
};
