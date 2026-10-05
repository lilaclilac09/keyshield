import React, { useState, useEffect, useCallback } from 'react';
import { Card, StatCard } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { DataTable, Column } from '../ui/DataTable';
import { PaymentBadge, inferPaymentStatus, type PaymentStatus } from '../ui/PaymentBadge';
import { VenueBadge, inferVenue, type Venue } from '../ui/VenueBadge';
import { CostBadge } from '../ui/CostBadge';
import { useWallet } from '@solana/wallet-adapter-react';
import { apiFetch, getToken, proxyFetch, vproxyFetch } from '../../lib/auth';
import { getDecryptedKey } from '../../lib/vault-session';
import { autosignOpenStream, autosignWithdrawStream, captureMppStream, closeMppStream, demoMeterStream, fetchCapturePrep, getMppStreamUsage, storeUpstreamKey } from '../../lib/api';
import { signCaptureMac, signOwnerBinding } from '../../lib/mpp-capture';
import { openStreamWithWallet, withdrawStreamWithWallet } from '../../lib/mpp-wallet-open';
import { OPENROUTER_CHAT_PATH, OPENROUTER_DEMO_MODEL, OPENROUTER_DEMO_UPSTREAM, openrouterChatBody } from '../../lib/openrouter-interface';

interface UsageEntry {
  id: number; upstream: string; key_type: string; method: string; path: string;
  tokens_in: number; tokens_out: number; cost_usd: number; latency_ms: number; status_code: number; ts: number;
  /** Server-supplied payment settlement state. Falls back to inferPaymentStatus. */
  payment_status?: PaymentStatus;
  /** Server-supplied response source. Falls back to inferVenue. */
  venue?: Venue;
}

interface UsageStat {
  upstream: string; key_type: string; calls: number; tokens_in: number; tokens_out: number;
  cost_usd: number; avg_latency: number; last_used: number;
}

interface BillingInfo { balance_usd: number; total_spent_usd: number; free_credit_usd: number; }
interface MppStream {
  id: number; agent_pubkey: string; agent_name: string; upstream: string;
  rate_per_call_micro_usdc: number; rate_per_token_micro_usdc: number; settlement_interval_secs: number;
  status: string; opened_at: number; last_settled_at: number; closed_at: number | null;
  total_calls: number; total_tokens: number; pending_micro_usdc: number; settled_micro_usdc: number;
  held_micro_usdc?: number; on_chain_signature: string | null;
  stream_pda?: string | null; stream_usdc_ata?: string | null; pending_artifact_hash?: string | null;
  last_settled_seq?: number;
}
interface AgentOpt { name: string; pubkey_b58: string }
interface MppSummary { streams_total: number; streams_open: number; tokens_total: number; calls_total: number; settled_usd: number; pending_usd: number; }
interface MppEvent { id: number; stream_id: number; kind: string; calls: number; tokens: number; micro_usdc: number; cost_usd: number; ts: number; upstream: string; agent_name: string; agent_pubkey: string; }

type Tab = 'usage' | 'stats' | 'billing' | 'topup' | 'mpp';

const upstreamColor = (u: string) => {
  const m: Record<string, string> = { openai: 'text-emerald-400', anthropic: 'text-orange-400', groq: 'text-yellow-400', mistral: 'text-blue-400', cohere: 'text-purple-400', helius: 'text-white', '0x': 'text-pink-400', alchemy: 'text-cyan-400', pyth: 'text-violet-400', titan: 'text-rose-400' };
  return m[u] ?? 'text-[#a8b3d8]';
};

const fmtTs = (ts: number) => new Date(ts * 1000).toLocaleString();
const fmtCost = (c: number) => `$${c.toFixed(4)}`;

export const ActivitySection: React.FC = () => {
  const { publicKey, sendTransaction, connected, signMessage } = useWallet();
  const [tab, setTab] = useState<Tab>('usage');
  const [history, setHistory] = useState<UsageEntry[]>([]);
  const [stats, setStats] = useState<UsageStat[]>([]);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [mppStreams, setMppStreams] = useState<MppStream[]>([]);
  const [mppSummary, setMppSummary] = useState<MppSummary | null>(null);
  const [mppEvents, setMppEvents] = useState<MppEvent[]>([]);
  const [topupAmt, setTopupAmt] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupMsg, setTopupMsg] = useState('');
  const [topupOk, setTopupOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autosignPubkey, setAutosignPubkey] = useState<string | null>(null);
  const [openAgent, setOpenAgent] = useState('');
  const [openUpstream, setOpenUpstream] = useState(OPENROUTER_DEMO_UPSTREAM);
  const [pasteKey, setPasteKey] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [openCap, setOpenCap] = useState('0.01');
  const [openBusy, setOpenBusy] = useState(false);
  const [openMsg, setOpenMsg] = useState('');
  const [openOk, setOpenOk] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState<number | null>(null);
  const [closeBusy, setCloseBusy] = useState<number | null>(null);
  const [streamUsage, setStreamUsage] = useState<Record<number, number>>({});
  const [agents, setAgents] = useState<AgentOpt[]>([]);
  const [programId, setProgramId] = useState('');
  const [openStep, setOpenStep] = useState('');
  const [meterBusy, setMeterBusy] = useState<number | null>(null);
  const [captureBusy, setCaptureBusy] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, sRes, bRes, mRes, mEvRes, aRes, agRes, hpRes] = await Promise.all([
        apiFetch('/usage/history?limit=30'),
        apiFetch('/usage/stats'),
        apiFetch('/billing/balance'),
        apiFetch('/mpp/streams'),
        apiFetch('/mpp/events?limit=20'),
        apiFetch('/mpp/autosign/status'),
        apiFetch('/agents/list'),
        apiFetch('/health/mpp'),
      ]);
      if (hRes.ok) { const d = await hRes.json(); setHistory(d.history ?? []); }
      if (sRes.ok) { const d = await sRes.json(); setStats(Array.isArray(d.stats) ? d.stats : []); }
      if (bRes.ok) { setBilling(await bRes.json()); }
      if (mRes.ok) {
        const d = await mRes.json();
        const streams = (d.streams ?? []) as MppStream[];
        setMppStreams(streams);
        setMppSummary(d.summary ?? null);
        const usagePairs = await Promise.all(
          streams.slice(0, 8).map(async (s) => {
            try {
              const rows = await getMppStreamUsage(s.id);
              return [s.id, rows.length] as const;
            } catch {
              return [s.id, 0] as const;
            }
          }),
        );
        setStreamUsage(Object.fromEntries(usagePairs));
      }
      if (mEvRes.ok) { const d = await mEvRes.json(); setMppEvents(d.events ?? []); }
      if (aRes.ok) { const d = await aRes.json(); setAutosignPubkey(d.loaded ? d.pubkey : null); }
      if (agRes.ok) {
        const d = await agRes.json();
        const list = (d.agents ?? []) as AgentOpt[];
        setAgents(list);
        setOpenAgent(prev => prev || list[0]?.pubkey_b58 || '');
      }
      if (hpRes.ok) {
        const d = await hpRes.json();
        if (d.active_program_id) setProgramId(d.active_program_id);
        if (d.demo?.enabled) setDemoMode(true);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleTopup = async () => {
    const amt = parseFloat(topupAmt);
    if (!amt || amt <= 0) return;
    setTopupBusy(true); setTopupMsg(''); setTopupOk(false);
    try {
      const r = await apiFetch('/billing/topup', { method: 'POST', body: JSON.stringify({ amount_usd: amt }) });
      const d = await r.json();
      if (!r.ok) { setTopupMsg(d.detail ?? 'Topup failed'); return; }
      setTopupOk(true); setTopupMsg(`Credited $${d.credited_usd?.toFixed(4) ?? amt.toFixed(4)} \u2014 new balance: $${d.balance_usd?.toFixed(4)}`);
      setTopupAmt('');
      const bRes = await apiFetch('/billing/balance');
      if (bRes.ok) setBilling(await bRes.json());
    } catch (e) { setTopupMsg(e instanceof Error ? e.message : 'Network error'); }
    finally { setTopupBusy(false); }
  };

  const handleOpenStream = async (mode: 'autosign' | 'wallet') => {
    const cap = parseFloat(openCap);
    if (!openAgent.trim() || !cap || cap <= 0) return;
    setOpenBusy(true); setOpenMsg(''); setOpenOk(false); setOpenStep('');
    const maxTotal = Math.round(cap * 1_000_000);
    try {
      if (mode === 'autosign') {
        setOpenStep('autosign: vault → grant → open');
        const d = await autosignOpenStream({
          agentPubkey: openAgent.trim(),
          agentName: openAgent.trim().slice(0, 8),
          upstream: openUpstream.trim() || 'openai',
          maxTotalMicroUsdc: maxTotal,
          ratePerTokenMicroUsdc: 1,
          ratePerCallMicroUsdc: 0,
        });
        setOpenOk(true);
        setOpenMsg(`Opened stream ${String((d.stream as { id?: number } | undefined)?.id ?? '')} — ${(d.txSignature as string | undefined)?.slice(0, 8) ?? ''}…`);
      } else {
        if (!publicKey || !programId) throw new Error('Connect the wallet and wait for /health/mpp program id');
        const d = await openStreamWithWallet({
          ownerPubkey: publicKey.toBase58(),
          programId,
          agentPubkey: openAgent.trim(),
          agentName: openAgent.trim().slice(0, 8),
          upstream: openUpstream.trim() || 'openai',
          maxTotalMicroUsdc: maxTotal,
          sendTransaction,
          onStep: setOpenStep,
        });
        setOpenOk(true);
        setOpenMsg(`Wallet signed stream ${d.streamId} — PDA ${d.streamPda.slice(0, 8)}…`);
      }
      setOpenAgent('');
      await refresh();
    } catch (e) {
      setOpenMsg(e instanceof Error ? e.message : 'Open failed');
    } finally {
      setOpenBusy(false);
      setOpenStep('');
    }
  };

  const handleWithdraw = async (stream: MppStream, mode: 'autosign' | 'wallet') => {
    setWithdrawBusy(stream.id);
    try {
      if (mode === 'wallet') {
        if (!publicKey || !stream.stream_pda || !stream.stream_usdc_ata) {
          throw new Error('Connect wallet and wait for stream PDA/ATA');
        }
        await withdrawStreamWithWallet({
          streamId: stream.id,
          ownerPubkey: publicKey.toBase58(),
          streamPda: stream.stream_pda,
          streamAta: stream.stream_usdc_ata,
          withdrawAmountMicroUsdc: stream.pending_micro_usdc || 0,
          sendTransaction,
        });
      } else {
        await autosignWithdrawStream(stream.id);
      }
      await refresh();
    } catch (e) {
      setOpenMsg(e instanceof Error ? e.message : 'Withdraw failed');
    } finally {
      setWithdrawBusy(null);
    }
  };

  const handleClose = async (streamId: number) => {
    setCloseBusy(streamId);
    try {
      await closeMppStream(streamId);
      setOpenOk(true);
      setOpenMsg(`Closed stream ${streamId}`);
      await refresh();
    } catch (e) {
      setOpenOk(false);
      setOpenMsg(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setCloseBusy(null);
    }
  };

  const handleSaveKey = async () => {
    const key = pasteKey.trim();
    if (!key) return;
    setPasteBusy(true); setOpenMsg(''); setOpenOk(false);
    try {
      await storeUpstreamKey(openUpstream.trim() || OPENROUTER_DEMO_UPSTREAM, key);
      setPasteKey('');
      setOpenOk(true);
      setOpenMsg(`Stored ${openUpstream || OPENROUTER_DEMO_UPSTREAM} key in the proxy vault — Meter uses it without unlocking Device Vault.`);
    } catch (e) {
      setOpenMsg(e instanceof Error ? e.message : 'Store failed');
    } finally {
      setPasteBusy(false);
    }
  };

  const handleMeter = async (stream: MppStream) => {
    setMeterBusy(stream.id);
    const path = stream.upstream === 'openrouter' || stream.upstream === OPENROUTER_DEMO_UPSTREAM
      ? OPENROUTER_CHAT_PATH
      : 'v1/chat/completions';
    const body = JSON.stringify(openrouterChatBody('KeyShield demo ping', OPENROUTER_DEMO_MODEL));
    const headers = { 'X-Mpp-Stream-Id': String(stream.id) };
    try {
      let res: Response | null = null;
      let via = '';
      if (getDecryptedKey(stream.upstream) || getDecryptedKey(OPENROUTER_DEMO_UPSTREAM)) {
        const up = getDecryptedKey(stream.upstream) ? stream.upstream : OPENROUTER_DEMO_UPSTREAM;
        res = await proxyFetch(up, path, { method: 'POST', headers, body });
        via = 'device-vault';
      } else {
        try {
          res = await vproxyFetch(stream.upstream, path, { method: 'POST', headers, body });
          via = 'vproxy';
          if (res.status === 422) res = null;
        } catch {
          res = null;
        }
      }
      if (!res) {
        const d = await demoMeterStream(stream.id, 'KeyShield demo ping');
        setOpenOk(true);
        setOpenMsg(`Demo meter stream ${stream.id}: ${String(d.meter ?? d.artifact_hash ?? 'ok')}`);
        await refresh();
        return;
      }
      const meter = res.headers.get('x-ks-mpp-meter');
      setOpenOk(res.ok);
      setOpenMsg(meter ? `${via} ${stream.upstream}: ${meter}` : `${via} HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setOpenOk(false);
      setOpenMsg(e instanceof Error ? e.message : 'Proxy meter failed');
    } finally {
      setMeterBusy(null);
    }
  };

  const handleCapture = async (stream: MppStream) => {
    const token = getToken();
    if (!token) return;
    setCaptureBusy(stream.id);
    try {
      const prep = await fetchCapturePrep(stream.id);
      const mac = await signCaptureMac(token, prep.artifactHash);
      let owner: { ownerPubkey: string; ownerSignature: string } | undefined;
      if (connected && publicKey && signMessage && prep.bindingHash) {
        const ownerSignature = await signOwnerBinding(signMessage, prep.bindingHash);
        owner = { ownerPubkey: publicKey.toBase58(), ownerSignature };
      }
      await captureMppStream(stream.id, prep.artifactHash, mac, owner);
      setOpenOk(true);
      setOpenMsg(
        owner
          ? `Captured stream ${stream.id} — session HMAC + wallet Ed25519`
          : `Captured stream ${stream.id} — session HMAC (owner keystore binds)`,
      );
      await refresh();
    } catch (e) {
      setOpenOk(false);
      setOpenMsg(e instanceof Error ? e.message : 'Capture failed');
    } finally {
      setCaptureBusy(null);
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'usage', label: 'Usage Log' },
    { id: 'stats', label: 'Statistics' },
    { id: 'billing', label: 'Billing' },
    { id: 'topup', label: 'Top Up' },
    { id: 'mpp', label: 'MPP Streams' },
  ];

  const historyCols: Column<UsageEntry>[] = [
    { header: 'Upstream', render: e => <span className={upstreamColor(e.upstream)}>{e.upstream}</span> },
    { header: 'Method', render: e => <span className="text-[#8a96c2]">{e.method}</span> },
    { header: 'Tokens', render: e => <span className="font-mono text-[11px]">{e.tokens_in + e.tokens_out}</span> },
    { header: 'Cost', render: e => <span className={e.cost_usd > 0 ? 'text-white' : 'text-[#5e6a91]'}>{fmtCost(e.cost_usd)}</span> },
    { header: 'Latency', render: e => <span className="text-[#8a96c2]">{e.latency_ms}ms</span> },
    { header: 'Time', render: e => <span className="text-[#5e6a91]">{fmtTs(e.ts)}</span> },
    { header: 'Payment', render: e => <PaymentBadge status={e.payment_status ?? inferPaymentStatus(e)} /> },
    { header: 'Venue', render: e => <VenueBadge venue={e.venue ?? inferVenue(e)} /> },
    { header: 'Call Cost', render: e => <CostBadge costUsd={e.cost_usd} /> },
  ];

  const statsCols: Column<UsageStat>[] = [
    { header: 'Upstream', render: s => <span className={upstreamColor(s.upstream)}>{s.upstream}</span> },
    { header: 'Calls', render: s => <span className="text-white">{s.calls.toLocaleString()}</span> },
    { header: 'Tokens', render: s => <span className="font-mono text-[11px]">{(s.tokens_in + s.tokens_out).toLocaleString()}</span> },
    { header: 'Cost', render: s => <span className="text-white">{fmtCost(s.cost_usd)}</span> },
    { header: 'Avg Latency', render: s => <span className="text-[#8a96c2]">{Math.round(s.avg_latency)}ms</span> },
    { header: 'Last Used', render: s => <span className="text-[#5e6a91]">{fmtTs(s.last_used)}</span> },
  ];

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-[#243365] bg-[#0e1631] p-1 text-[11px]">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 px-3 py-1.5 rounded-lg transition-colors ${tab === t.id ? 'bg-white text-black font-semibold' : 'text-[#a8b3d8] hover:text-white'}`}>{t.label}</button>
        ))}
      </div>

      {/* Usage Log */}
      {tab === 'usage' && (
        <Card title="Usage Log" description="Recent proxy calls with cost and latency" headerRight={<button onClick={refresh} className="text-[#8a96c2] hover:text-white"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}><path d="M21 12a9 9 0 11-6.2-8.6"/><path d="M21 3v6h-6"/></svg></button>}>
          <DataTable columns={historyCols} data={history} emptyMessage="No usage recorded yet." />
        </Card>
      )}

      {/* Statistics */}
      {tab === 'stats' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <StatCard label="Total Calls" value={stats.reduce((s, x) => s + x.calls, 0).toLocaleString()} />
            <StatCard label="Total Tokens" value={(stats.reduce((s, x) => s + x.tokens_in + x.tokens_out, 0)).toLocaleString()} />
            <StatCard label="Total Cost" value={fmtCost(stats.reduce((s, x) => s + x.cost_usd, 0))} />
            <StatCard label="Avg Latency" value={`${stats.length ? Math.round(stats.reduce((s, x) => s + x.avg_latency, 0) / stats.length) : 0}ms`} />
          </div>
          <Card title="Per-Provider Statistics">
            {/* DataTable's row constraint expects `id`. UsageStat is keyed by
                `upstream` server-side; project that as `id` for stable React
                keys without changing the wire shape. */}
            <DataTable columns={statsCols as any} data={stats.map(s => ({ ...s, id: s.upstream }))} emptyMessage="No stats available." />
          </Card>
        </div>
      )}

      {/* Billing */}
      {tab === 'billing' && billing && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard label="Balance" value={fmtCost(billing.balance_usd)} hint={billing.balance_usd <= 0 ? 'Add funds to continue' : undefined} trend={billing.balance_usd > 0 ? 'up' : undefined} />
            <StatCard label="Total Spent" value={fmtCost(billing.total_spent_usd)} />
            <StatCard label="Free Credit" value={fmtCost(billing.free_credit_usd)} hint={billing.free_credit_usd <= 0 ? 'Used up' : '~100 GPT-4o-mini calls'} />
          </div>
          <Card title="Top Up" description="Activity ledger credit via POST /billing/topup. Phantom SOL on-chain top-up has no /billing/sol-quote route — use Devnet wallet USDC for MPP escrow.">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-[#8a96c2] uppercase tracking-wider mb-1.5">Amount (USD)</label>
                <input type="number" min="1" step="0.01" value={topupAmt} onChange={e => { setTopupAmt(e.target.value); setTopupMsg(''); setTopupOk(false); }} placeholder="10.00" className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10" />
              </div>
              <Button variant="primary" size="md" onClick={handleTopup} disabled={topupBusy || !topupAmt} loading={topupBusy}>Top Up</Button>
            </div>
            {topupMsg && <p className={`text-[12px] mt-2 ${topupOk ? 'text-emerald-400' : 'text-red-400'}`}>{topupMsg}</p>}
          </Card>
        </div>
      )}

      {tab === 'topup' && (
        <Card title="Top Up" description="POST /billing/topup ledger credit. Not Phantom SOL. MPP escrow is funded on Open (auto-sign / wallet).">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-[#8a96c2] uppercase tracking-wider mb-1.5">Amount (USD)</label>
              <input type="number" min="1" step="0.01" value={topupAmt} onChange={e => { setTopupAmt(e.target.value); setTopupMsg(''); setTopupOk(false); }} placeholder="10.00" className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10" />
            </div>
            <Button variant="primary" size="md" onClick={handleTopup} disabled={topupBusy || !topupAmt} loading={topupBusy}>Top Up</Button>
          </div>
          {topupMsg && <p className={`text-[12px] mt-2 ${topupOk ? 'text-emerald-400' : 'text-red-400'}`}>{topupMsg}</p>}
        </Card>
      )}

      {/* MPP Streams */}
      {tab === 'mpp' && (
        <div className="space-y-4">
          {mppSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Streams" value={`${mppSummary.streams_open}/${mppSummary.streams_total}`} hint="active / total" />
              <StatCard label="Calls" value={mppSummary.calls_total.toLocaleString()} />
              <StatCard label="Tokens" value={mppSummary.tokens_total.toLocaleString()} />
              <StatCard label="Settled" value={fmtCost(mppSummary.settled_usd)} />
            </div>
          )}
          <Card title="Open payment stream" description="vault → grant → open (prereq ATA + fund) → record-tx PDA. Auto-sign uses the sealed owner key; wallet sign uses Phantom/Solflare on Devnet. Meter: Device Vault → server vault → demo-meter.">
            <p className="text-[11px] text-[#8a96c2] mb-3">
              {autosignPubkey ? `Auto-sign ${autosignPubkey.slice(0, 4)}…${autosignPubkey.slice(-4)}` : 'Auto-sign off'}
              {' · '}
              {connected && publicKey ? `Wallet ${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}` : 'Wallet disconnected'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-[#8a96c2] uppercase tracking-wider mb-1.5">Agent</label>
                {agents.length > 0 ? (
                  <select value={openAgent} onChange={e => setOpenAgent(e.target.value)} className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] font-mono text-white">
                    <option value="">Select agent</option>
                    {agents.map(a => (
                      <option key={a.pubkey_b58} value={a.pubkey_b58}>{a.name || a.pubkey_b58.slice(0, 8)} · {a.pubkey_b58.slice(0, 8)}…</option>
                    ))}
                  </select>
                ) : (
                  <input value={openAgent} onChange={e => setOpenAgent(e.target.value)} placeholder="base58 pubkey" className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] font-mono text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10" />
                )}
              </div>
              <div>
                <label className="block text-[10px] text-[#8a96c2] uppercase tracking-wider mb-1.5">Upstream</label>
                <input value={openUpstream} onChange={e => setOpenUpstream(e.target.value)} placeholder={OPENROUTER_DEMO_UPSTREAM} className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10" />
              </div>
              <div>
                <label className="block text-[10px] text-[#8a96c2] uppercase tracking-wider mb-1.5">Cap (USDC)</label>
                <input type="number" min="0.000001" step="0.01" value={openCap} onChange={e => setOpenCap(e.target.value)} className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-white/10" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="md" onClick={() => handleOpenStream('autosign')} disabled={openBusy || !autosignPubkey || !openAgent.trim()} loading={openBusy && openStep.startsWith('autosign')}>Open (auto-sign)</Button>
              <Button variant="secondary" size="md" onClick={() => handleOpenStream('wallet')} disabled={openBusy || !connected || !programId || !openAgent.trim()} loading={openBusy && !openStep.startsWith('autosign')}>Open (wallet sign)</Button>
            </div>
            <div className="mt-4">
              <label className="block text-[10px] text-[#8a96c2] uppercase tracking-wider mb-1.5">Paste OpenRouter API key</label>
              <div className="flex gap-2">
                <input type="password" value={pasteKey} onChange={e => setPasteKey(e.target.value)} placeholder="sk-or-v1-… auto-fills /manage/store + vproxy" className="flex-1 bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] font-mono text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10" />
                <Button variant="secondary" size="md" onClick={handleSaveKey} disabled={pasteBusy || !pasteKey.trim()} loading={pasteBusy}>Save to proxy</Button>
              </div>
              <p className="text-[10px] text-[#5e6a91] mt-1.5">Free model {OPENROUTER_DEMO_MODEL}. Anyone with this demo session can meter; the proxy is still authenticated. Key is never echoed back.</p>
            </div>
            {openStep && <p className="text-[11px] text-[#8a96c2] mt-2">Step: {openStep}</p>}
            {openMsg && <p className={`text-[12px] mt-2 ${openOk ? 'text-emerald-400' : 'text-red-400'}`}>{openMsg}</p>}
            {demoMode && <p className="text-[10px] text-[#5e6a91] mt-2">Demo mode on — Meter falls back to synthetic hold if no key is pasted.</p>}
          </Card>
          <Card title="Active Streams">
            {mppStreams.length === 0 ? <p className="text-[12px] text-[#5e6a91] text-center py-4">No MPP streams open yet.</p> :
              mppStreams.map(s => (
                <div key={s.id} className="flex items-center gap-4 px-4 py-3 border-b border-[#243365]/30 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-[#243365] flex items-center justify-center shrink-0"><span className="text-[11px] font-mono text-white">M</span></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-[13px] text-white font-medium">{s.agent_name || s.agent_pubkey.slice(0, 8)}</span><Badge variant={s.status === 'open' ? 'success' : 'neutral'}>{s.status}</Badge></div>
                    <div className="text-[11px] text-[#5e6a91] mt-0.5">{s.upstream} · {s.total_calls} calls · settled {fmtCost(s.settled_micro_usdc / 1_000_000)} · pending {fmtCost((s.pending_micro_usdc || 0) / 1_000_000)} · usage {streamUsage[s.id] ?? 0}</div>
                    {s.stream_pda && <div className="text-[10px] font-mono text-[#3e4a72] mt-0.5">PDA {s.stream_pda.slice(0, 8)}…{s.stream_pda.slice(-4)}</div>}
                  </div>
                  {s.status === 'open' && (
                    <Button variant="secondary" size="sm" loading={meterBusy === s.id} disabled={meterBusy !== null} onClick={() => handleMeter(s)}>Meter</Button>
                  )}
                  {s.status === 'open' && s.pending_artifact_hash && (
                    <Button variant="primary" size="sm" loading={captureBusy === s.id} disabled={captureBusy !== null} onClick={() => handleCapture(s)}>Capture</Button>
                  )}
                  {s.status === 'open' && autosignPubkey && (
                    <Button variant="destructive" size="sm" loading={withdrawBusy === s.id} disabled={withdrawBusy !== null} onClick={() => handleWithdraw(s, 'autosign')}>Withdraw</Button>
                  )}
                  {s.status === 'open' && connected && s.stream_pda && (
                    <Button variant="secondary" size="sm" loading={withdrawBusy === s.id} disabled={withdrawBusy !== null} onClick={() => handleWithdraw(s, 'wallet')}>Withdraw (wallet)</Button>
                  )}
                  {s.status === 'open' && (
                    <Button variant="ghost" size="sm" loading={closeBusy === s.id} disabled={closeBusy !== null} onClick={() => handleClose(s.id)}>Close</Button>
                  )}
                  {s.on_chain_signature && <a href={`https://explorer.solana.com/tx/${s.on_chain_signature}?cluster=devnet`} target="_blank" rel="noreferrer" className="text-[11px] text-white hover:underline">View TX</a>}
                </div>
              ))
            }
          </Card>
          {mppEvents.length > 0 && (
            <Card title="Recent MPP Events">
              <div className="space-y-1.5">
                {mppEvents.slice(0, 10).map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0e1631] border border-[#243365]">
                    <Badge variant={e.kind === 'open' ? 'success' : e.kind === 'settle' ? 'info' : 'default'}>{e.kind}</Badge>
                    <span className="text-[11px] text-[#e8ecff] flex-1">{e.agent_name || e.agent_pubkey.slice(0, 8)} \xb7 {e.upstream}</span>
                    <span className="text-[11px] text-[#8a96c2] font-mono">{e.calls} calls \xb7 {e.tokens} tok \xb7 {fmtCost(e.cost_usd)}</span>
                    <span className="text-[10px] text-[#3e4a72]">{fmtTs(e.ts)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
