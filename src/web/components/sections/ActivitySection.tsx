import React, { useState, useEffect, useCallback } from 'react';
import { Card, StatCard } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { DataTable, Column } from '../ui/DataTable';
import { PaymentBadge, inferPaymentStatus, type PaymentStatus } from '../ui/PaymentBadge';
import { VenueBadge, inferVenue, type Venue } from '../ui/VenueBadge';
import { CostBadge } from '../ui/CostBadge';
import { apiFetch } from '../../lib/auth';
import { normalizeStats, usageTotals, type UsageStat } from '../../lib/usage-stats';

interface UsageEntry {
  id: number; upstream: string; key_type: string; method: string; path: string;
  tokens_in: number; tokens_out: number; cost_usd: number; latency_ms: number; status_code: number; ts: number;
  /** Server-supplied payment settlement state. Falls back to inferPaymentStatus. */
  payment_status?: PaymentStatus;
  /** Server-supplied response source. Falls back to inferVenue. */
  venue?: Venue;
}

interface BillingInfo { balance_usd: number; total_spent_usd: number; free_credit_usd: number; }
interface MppStream { id: number; agent_pubkey: string; agent_name: string; upstream: string; rate_per_call_micro_usdc: number; rate_per_token_micro_usdc: number; settlement_interval_secs: number; status: string; opened_at: number; last_settled_at: number; closed_at: number | null; total_calls: number; total_tokens: number; pending_micro_usdc: number; settled_micro_usdc: number; on_chain_signature: string | null; }
interface MppSummary { streams_total: number; streams_open: number; tokens_total: number; calls_total: number; settled_usd: number; pending_usd: number; }
interface MppEvent { id: number; stream_id: number; kind: string; calls: number; tokens: number; micro_usdc: number; cost_usd: number; ts: number; upstream: string; agent_name: string; agent_pubkey: string; }

type Tab = 'usage' | 'stats' | 'billing' | 'topup' | 'mpp';

const upstreamColor = (u: string) => {
  const m: Record<string, string> = { openai: 'text-emerald-400', anthropic: 'text-orange-400', groq: 'text-yellow-400', mistral: 'text-blue-400', cohere: 'text-purple-400', helius: 'text-white', '0x': 'text-pink-400', alchemy: 'text-cyan-400', pyth: 'text-violet-400', titan: 'text-rose-400' };
  return m[u] ?? 'text-[#a8b3d8]';
};

const fmtTs = (ts: number) => (ts ? new Date(ts * 1000).toLocaleString() : '—');
const fmtCost = (c: number) => `$${c.toFixed(4)}`;
const fmtTok = (n: number) => (n || 0).toLocaleString();

const RefreshIcon: React.FC<{ spinning?: boolean }> = ({ spinning }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={spinning ? 'animate-spin' : ''}>
    <path d="M21 12a9 9 0 11-6.2-8.6"/><path d="M21 3v6h-6"/>
  </svg>
);

export const ActivitySection: React.FC = () => {
  const [tab, setTab] = useState<Tab>('stats');
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
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    const failures: string[] = [];
    try {
      const [hRes, sRes, bRes, mRes, mEvRes] = await Promise.all([
        apiFetch('/usage/history?limit=30'),
        apiFetch('/usage/stats'),
        apiFetch('/billing/balance'),
        apiFetch('/mpp/streams'),
        apiFetch('/mpp/events?limit=20'),
      ]);
      if (hRes.ok) {
        const d = await hRes.json();
        setHistory(Array.isArray(d.history) ? d.history : []);
      } else {
        failures.push(`usage/history ${hRes.status}`);
      }
      if (sRes.ok) {
        const d = await sRes.json();
        setStats(normalizeStats(d));
      } else {
        failures.push(`usage/stats ${sRes.status}`);
      }
      if (bRes.ok) { setBilling(await bRes.json()); }
      else failures.push(`billing/balance ${bRes.status}`);
      if (mRes.ok) { const d = await mRes.json(); setMppStreams(d.streams ?? []); setMppSummary(d.summary ?? null); }
      if (mEvRes.ok) { const d = await mEvRes.json(); setMppEvents(d.events ?? []); }
    } catch (e) {
      failures.push(e instanceof Error ? e.message : 'Network error');
    }
    if (failures.length) setError(failures.join(' · '));
    setLoading(false);
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

  const TABS: { id: Tab; label: string }[] = [
    { id: 'stats', label: 'Token Consumption' },
    { id: 'usage', label: 'Usage Log' },
    { id: 'billing', label: 'Billing' },
    { id: 'topup', label: 'Top Up' },
    { id: 'mpp', label: 'MPP Streams' },
  ];

  const totals = usageTotals(stats);

  const historyCols: Column<UsageEntry>[] = [
    { header: 'Upstream', render: e => <span className={upstreamColor(e.upstream)}>{e.upstream}</span> },
    { header: 'Method', render: e => <span className="text-[#8a96c2]">{e.method}</span> },
    { header: 'In', render: e => <span className="font-mono text-[11px]">{fmtTok(e.tokens_in)}</span> },
    { header: 'Out', render: e => <span className="font-mono text-[11px]">{fmtTok(e.tokens_out)}</span> },
    { header: 'Total', render: e => <span className="font-mono text-[11px] text-white">{fmtTok(e.tokens_in + e.tokens_out)}</span> },
    { header: 'Cost', render: e => <span className={e.cost_usd > 0 ? 'text-white' : 'text-[#5e6a91]'}>{fmtCost(e.cost_usd)}</span> },
    { header: 'Latency', render: e => <span className="text-[#8a96c2]">{e.latency_ms}ms</span> },
    { header: 'Time', render: e => <span className="text-[#5e6a91]">{fmtTs(e.ts)}</span> },
    { header: 'Payment', render: e => <PaymentBadge status={e.payment_status ?? inferPaymentStatus(e)} /> },
    { header: 'Venue', render: e => <VenueBadge venue={e.venue ?? inferVenue(e)} /> },
    { header: 'Call Cost', render: e => <CostBadge costUsd={e.cost_usd} /> },
  ];

  const statsCols: Column<UsageStat & { id: string }>[] = [
    { header: 'Upstream', render: s => <span className={upstreamColor(s.upstream)}>{s.upstream}</span> },
    { header: 'Key', render: s => <span className="text-[#8a96c2]">{s.key_type || '—'}</span> },
    { header: 'Calls', render: s => <span className="text-white">{s.calls.toLocaleString()}</span> },
    { header: 'Tokens In', render: s => <span className="font-mono text-[11px]">{fmtTok(s.tokens_in)}</span> },
    { header: 'Tokens Out', render: s => <span className="font-mono text-[11px]">{fmtTok(s.tokens_out)}</span> },
    { header: 'Total', render: s => <span className="font-mono text-[11px] text-white">{fmtTok(s.tokens_in + s.tokens_out)}</span> },
    { header: 'Cost', render: s => <span className="text-white">{fmtCost(s.cost_usd)}</span> },
    { header: 'Avg Latency', render: s => <span className="text-[#8a96c2]">{Math.round(s.avg_latency)}ms</span> },
    { header: 'Last Used', render: s => <span className="text-[#5e6a91]">{fmtTs(s.last_used)}</span> },
  ];

  const topupForm = (
    <Card title="Top Up" description="Add funds with SOL. Converted to USDC at current Pyth oracle rate.">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="block text-[10px] text-[#8a96c2] uppercase tracking-wider mb-1.5">Amount (USD)</label>
          <input type="number" min="1" step="0.01" value={topupAmt} onChange={e => { setTopupAmt(e.target.value); setTopupMsg(''); setTopupOk(false); }} placeholder="10.00" className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10" />
        </div>
        <Button variant="primary" size="md" onClick={handleTopup} disabled={topupBusy || !topupAmt} loading={topupBusy}>Top Up</Button>
      </div>
      {topupMsg && <p className={`text-[12px] mt-2 ${topupOk ? 'text-emerald-400' : 'text-red-400'}`}>{topupMsg}</p>}
    </Card>
  );

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2 text-[12px] text-red-300">
          Failed to load usage: {error}
        </div>
      )}

      <div className="flex gap-1 rounded-lg border border-[#243365] bg-[#0e1631] p-1 text-[11px]">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 px-3 py-1.5 rounded-lg transition-colors ${tab === t.id ? 'bg-white text-black font-semibold' : 'text-[#a8b3d8] hover:text-white'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'stats' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Total Calls" value={totals.calls.toLocaleString()} />
            <StatCard label="Tokens In" value={fmtTok(totals.tokens_in)} hint="prompt / input" />
            <StatCard label="Tokens Out" value={fmtTok(totals.tokens_out)} hint="completion / output" />
            <StatCard label="Total Tokens" value={fmtTok(totals.tokens_in + totals.tokens_out)} />
            <StatCard label="Total Cost" value={fmtCost(totals.cost_usd)} />
          </div>
          <Card
            title="Token Consumption"
            description="Per-provider input / output tokens · 按上游拆分的入站 / 出站 token"
            headerRight={<button onClick={refresh} aria-label="Refresh usage" className="text-[#8a96c2] hover:text-white"><RefreshIcon spinning={loading} /></button>}
          >
            <DataTable
              columns={statsCols}
              data={stats.map(s => ({ ...s, id: `${s.upstream}:${s.key_type}` }))}
              emptyMessage="No token usage yet. Proxy an LLM call to populate this table."
            />
          </Card>
        </div>
      )}

      {tab === 'usage' && (
        <Card title="Usage Log" description="Recent proxy calls with in / out tokens, cost, and latency" headerRight={<button onClick={refresh} aria-label="Refresh usage" className="text-[#8a96c2] hover:text-white"><RefreshIcon spinning={loading} /></button>}>
          <DataTable columns={historyCols} data={history} emptyMessage="No usage recorded yet." />
        </Card>
      )}

      {tab === 'billing' && (
        <div className="space-y-4">
          {billing ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard label="Balance" value={fmtCost(billing.balance_usd)} hint={billing.balance_usd <= 0 ? 'Add funds to continue' : undefined} trend={billing.balance_usd > 0 ? 'up' : undefined} />
              <StatCard label="Total Spent" value={fmtCost(billing.total_spent_usd)} />
              <StatCard label="Free Credit" value={fmtCost(billing.free_credit_usd)} hint={billing.free_credit_usd <= 0 ? 'Used up' : '~100 GPT-4o-mini calls'} />
            </div>
          ) : (
            <p className="text-[12px] text-[#5e6a91]">Balance unavailable.</p>
          )}
          {topupForm}
        </div>
      )}

      {tab === 'topup' && topupForm}

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
          <Card title="Active Streams">
            {mppStreams.length === 0 ? <p className="text-[12px] text-[#5e6a91] text-center py-4">No MPP streams open yet.</p> :
              mppStreams.map(s => (
                <div key={s.id} className="flex items-center gap-4 px-4 py-3 border-b border-[#243365]/30 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-[#243365] flex items-center justify-center shrink-0"><span className="text-[11px] font-mono text-white">M</span></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-[13px] text-white font-medium">{s.agent_name || s.agent_pubkey.slice(0, 8)}</span><Badge variant={s.status === 'open' ? 'success' : 'neutral'}>{s.status}</Badge></div>
                    <div className="text-[11px] text-[#5e6a91] mt-0.5">{s.upstream} · {s.total_calls} calls · settled {fmtCost(s.settled_micro_usdc / 1_000_000)}</div>
                  </div>
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
                    <span className="text-[11px] text-[#e8ecff] flex-1">{e.agent_name || e.agent_pubkey.slice(0, 8)} · {e.upstream}</span>
                    <span className="text-[11px] text-[#8a96c2] font-mono">{e.calls} calls · {e.tokens} tok · {fmtCost(e.cost_usd)}</span>
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
