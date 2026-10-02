import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, StatCard } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { DataTable, Column } from '../ui/DataTable';
import { ProductTabs } from '../ui/ProductTabs';
import { apiFetch } from '../../lib/auth';

type Tab = 'summary' | 'breakdown' | 'calls' | 'plans' | 'streams' | 'balance';

interface Plan {
  id: string;
  name: string;
  monthly_usd: number;
  included_calls: number;
  agents: number | null;
  recommended: boolean;
  includes: string[];
  selected?: boolean;
}

interface UpstreamShare {
  upstream: string;
  calls: number;
  share_pct: number;
}

interface Breakdown {
  plan: Plan;
  period: string;
  allowance: {
    used_calls: number;
    included_calls: number;
    remaining_calls: number;
    used_pct: number;
    covered: boolean;
  };
  by_upstream: UpstreamShare[];
  own_keys: { calls: number; headline: string };
  settlement: {
    monthly_usd: number;
    headline: string;
    calls_inside_plan: number;
    calls_outside_plan: number;
    covers_with: string | null;
  };
  plans: Plan[];
}

interface UsageEntry {
  id: number;
  upstream: string;
  key_type: string;
  method: string;
  path: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  ts: number;
}

interface UsageStat {
  upstream: string;
  key_type?: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  avg_latency: number;
}

interface BillingInfo { balance_usd: number; total_spent_usd: number; free_credit_usd: number; }

interface MppStream {
  id: number;
  agent_pubkey: string;
  agent_name: string;
  upstream: string;
  status: string;
  total_calls: number;
  settled_micro_usdc: number;
  on_chain_signature: string | null;
}

interface MppSummary {
  streams_total: number;
  streams_open: number;
  tokens_total: number;
  calls_total: number;
  settled_usd: number;
}

interface RankedUpstream extends UpstreamShare {
  id: string;
  rank: number;
  rating: number | null;
}

const fmtCalls = (n: number) => n.toLocaleString('en-US');
const fmtTs = (ts: number) => new Date(ts * 1000).toLocaleString();

/** 1–5 from measured average latency. Missing or zero samples keep the rating column reserved. */
function ratingFromLatency(ms: number | undefined): number | null {
  if (ms == null || Number.isNaN(ms) || ms <= 0) return null;
  if (ms < 80) return 5;
  if (ms < 150) return 4;
  if (ms < 300) return 3;
  if (ms < 800) return 2;
  return 1;
}

const RankMark: React.FC<{ rank: number }> = ({ rank }) => (
  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#243365] bg-[#0e1631] text-[12px] font-semibold tabular-nums text-white">
    {rank}
  </span>
);

const RatingMarks: React.FC<{ score: number | null }> = ({ score }) => (
  <span className="inline-flex w-[108px] items-center gap-1" title={score == null ? 'Rating column reserved' : `Rating ${score} of 5 from average latency`} aria-label={score == null ? 'Rating reserved' : `Rating ${score} of 5`}>
    {[1, 2, 3, 4, 5].map((step) => {
      const filled = score != null && step <= score;
      return (
        <svg key={step} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className={filled ? 'text-amber-300' : 'text-[#243365]'}>
          <path fill="currentColor" d="M8 1.4 9.9 5.7l4.7.4-3.6 3.1.1 4.7L8 11.6 4.9 13.9l.1-4.7L1.4 6.1l4.7-.4L8 1.4Z" />
        </svg>
      );
    })}
  </span>
);

export const SpendWorkspace: React.FC<{ initial?: Tab }> = ({ initial = 'summary' }) => {
  const [tab, setTab] = useState<Tab>(initial);
  const [data, setData] = useState<Breakdown | null>(null);
  const [history, setHistory] = useState<UsageEntry[]>([]);
  const [stats, setStats] = useState<UsageStat[]>([]);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [streams, setStreams] = useState<MppStream[]>([]);
  const [mppSummary, setMppSummary] = useState<MppSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [topupAmt, setTopupAmt] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupMsg, setTopupMsg] = useState('');
  const [topupOk, setTopupOk] = useState(false);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [planRes, hRes, sRes, bRes, mRes] = await Promise.all([
        apiFetch('/billing/breakdown'),
        apiFetch('/usage/history?limit=30'),
        apiFetch('/usage/stats'),
        apiFetch('/billing/balance'),
        apiFetch('/mpp/streams'),
      ]);
      if (planRes.ok) setData(await planRes.json());
      else setError('The plan breakdown is unavailable.');
      if (hRes.ok) { const d = await hRes.json(); setHistory(Array.isArray(d.history) ? d.history : []); }
      if (sRes.ok) {
        const d = await sRes.json();
        const rows = Array.isArray(d.stats) ? d.stats : d.stats?.stats;
        setStats(Array.isArray(rows) ? rows : []);
      }
      if (bRes.ok) setBilling(await bRes.json());
      if (mRes.ok) { const d = await mRes.json(); setStreams(d.streams ?? []); setMppSummary(d.summary ?? null); }
    } catch {
      setError('The plan breakdown is unavailable.');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const choose = async (planId: string) => {
    setBusy(planId);
    setError('');
    try {
      const res = await apiFetch('/billing/subscription', {
        method: 'POST',
        body: JSON.stringify({ plan: planId }),
      });
      if (!res.ok) { setError('That plan could not be selected.'); return; }
      await refresh();
    } catch {
      setError('That plan could not be selected.');
    } finally {
      setBusy(null);
    }
  };

  const handleTopup = async () => {
    const amt = parseFloat(topupAmt);
    if (!amt || amt <= 0) return;
    setTopupBusy(true); setTopupMsg(''); setTopupOk(false);
    try {
      const r = await apiFetch('/billing/topup', { method: 'POST', body: JSON.stringify({ amount_usd: amt }) });
      const d = await r.json();
      if (!r.ok) { setTopupMsg(d.detail ?? 'Top up failed'); return; }
      setTopupOk(true);
      setTopupMsg(`Credited $${Number(d.credited_usd ?? amt).toFixed(2)}. Prepaid balance is $${Number(d.balance_usd ?? 0).toFixed(2)}.`);
      setTopupAmt('');
      const bRes = await apiFetch('/billing/balance');
      if (bRes.ok) setBilling(await bRes.json());
    } catch (e) {
      setTopupMsg(e instanceof Error ? e.message : 'Network error');
    } finally {
      setTopupBusy(false);
    }
  };

  const latencyByUpstream = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stats) {
      if (row.key_type === 'platform' || !map.has(row.upstream)) map.set(row.upstream, row.avg_latency);
    }
    return map;
  }, [stats]);

  const ranked = useMemo<RankedUpstream[]>(() => {
    const rows = [...(data?.by_upstream ?? [])].sort((a, b) => b.calls - a.calls || a.upstream.localeCompare(b.upstream));
    return rows.map((row, index) => ({
      ...row,
      id: row.upstream,
      rank: index + 1,
      rating: ratingFromLatency(latencyByUpstream.get(row.upstream)),
    }));
  }, [data, latencyByUpstream]);

  const usedPct = data ? Math.min(100, data.allowance.used_pct) : 0;

  const breakdownCols: Column<RankedUpstream>[] = [
    { header: 'Rank', className: '72px', render: (row) => <RankMark rank={row.rank} /> },
    { header: 'Provider', className: 'minmax(120px,1.1fr)', render: (row) => <span className="font-medium text-white capitalize">{row.upstream}</span> },
    { header: 'Calls', className: '96px', render: (row) => <span className="tabular-nums">{fmtCalls(row.calls)}</span> },
    {
      header: 'Share of plan',
      className: 'minmax(160px,1.6fr)',
      render: (row) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-1.5 flex-1 rounded-full bg-[#0e1631] overflow-hidden">
            <div className="h-full bg-white" style={{ width: `${Math.min(100, row.share_pct)}%` }} />
          </div>
          <span className="w-12 text-right tabular-nums text-[#a8b3d8]">{row.share_pct}%</span>
        </div>
      ),
    },
    {
      header: 'Rating',
      className: '132px',
      render: (row) => (
        <div className="flex items-center gap-2">
          <RatingMarks score={row.rating} />
          <span className="w-6 text-[10px] tabular-nums text-[#5e6a91]">{row.rating == null ? '—' : row.rating}</span>
        </div>
      ),
    },
  ];

  const callCols: Column<UsageEntry>[] = [
    { header: 'When', className: 'minmax(140px,1.2fr)', render: (row) => <span className="text-[#8a96c2]">{fmtTs(row.ts)}</span> },
    { header: 'Provider', className: 'minmax(90px,0.8fr)', render: (row) => <span className="text-white capitalize">{row.upstream}</span> },
    { header: 'Call', className: 'minmax(120px,1.3fr)', render: (row) => <span className="font-mono text-[11px] text-[#a8b3d8] truncate">{row.method} {row.path}</span> },
    { header: 'Tokens', className: '88px', render: (row) => <span className="tabular-nums">{fmtCalls(row.tokens_in + row.tokens_out)}</span> },
    { header: 'Latency', className: '80px', render: (row) => <span className="tabular-nums text-[#a8b3d8]">{row.latency_ms}ms</span> },
    {
      header: 'Settlement',
      className: '110px',
      render: (row) => row.key_type === 'platform'
        ? <Badge variant="success">Included</Badge>
        : <Badge variant="neutral">Own key</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a96c2]">Spend</p>
          <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-white">
            {data?.settlement.headline ?? 'Loading this month'}
          </h2>
          <p className="mt-1 text-[13px] text-[#a8b3d8]">
            {data ? `${data.period} · ${data.plan.name} · $${data.plan.monthly_usd} / month` : 'One monthly price for platform calls.'}
          </p>
        </div>
        {data && (
          <div className="min-w-[220px]">
            <div className="mb-1.5 flex justify-between text-[11px] text-[#8a96c2]">
              <span>{fmtCalls(data.allowance.used_calls)} used</span>
              <span>{fmtCalls(data.allowance.included_calls)} included</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#0e1631]">
              <div className="h-full bg-white" style={{ width: `${Math.max(usedPct, data.allowance.used_calls > 0 ? 1 : 0)}%` }} />
            </div>
          </div>
        )}
      </div>

      <ProductTabs<Tab>
        label="Spend"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', label: 'Summary' },
          { id: 'breakdown', label: 'Breakdown', count: ranked.length },
          { id: 'calls', label: 'Calls', count: history.length },
          { id: 'plans', label: 'Plans', count: data?.plans.length },
          { id: 'streams', label: 'Streams', count: mppSummary?.streams_open ?? streams.length },
          { id: 'balance', label: 'Balance' },
        ]}
      />

      {error && <p className="text-[12px] text-red-400">{error}</p>}

      {tab === 'summary' && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard label="Monthly plan" value={`$${data.plan.monthly_usd}`} hint={data.plan.name} />
            <StatCard label="Platform calls" value={fmtCalls(data.allowance.used_calls)} hint={`${usedPct}% of ${data.plan.name}`} trend={data.allowance.covered ? 'up' : 'down'} />
            <StatCard label="Your own keys" value={fmtCalls(data.own_keys.calls)} hint="Outside the plan" />
          </div>

          <Card title="Why teams use this" description="The month settles as a plan. Rank and rating stay on the breakdown so you can compare providers without a per-call invoice.">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[#243365] bg-[#0e1631] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a96c2]">Plan price</p>
                <p className="mt-2 text-[14px] leading-snug text-white">Personal, Operate, and Floor each publish one monthly price and a call allowance.</p>
              </div>
              <div className="rounded-xl border border-[#243365] bg-[#0e1631] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a96c2]">Rank and rating</p>
                <p className="mt-2 text-[14px] leading-snug text-white">Providers are ordered by share of this month. The rating column stays a fixed width, filled from measured latency.</p>
              </div>
              <div className="rounded-xl border border-[#243365] bg-[#0e1631] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a96c2]">Keys stay on device</p>
                <p className="mt-2 text-[14px] leading-snug text-white">The agent holds a session token. Your own keys are counted here and never added to the plan.</p>
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-[#8a96c2]">
              Usage meters itemize a price on every request. Environment variables leave the raw key in logs and require a redeploy to rotate.
              This workspace keeps the invoice on the plan, shows who used the allowance, and leaves room to rate each provider.
            </p>
          </Card>

          <Card title="Top of this month" description="The same rank and rating columns as the full breakdown." headerRight={<button type="button" onClick={() => setTab('breakdown')} className="text-[12px] text-white hover:underline">Open breakdown</button>}>
            <DataTable columns={breakdownCols} data={ranked.slice(0, 3)} emptyMessage="No platform calls yet this month." />
          </Card>
        </div>
      )}

      {tab === 'breakdown' && (
        <Card title="Breakdown" description="Rank is share of platform calls. Rating uses average latency and keeps its column when a provider has no sample yet.">
          <DataTable columns={breakdownCols} data={ranked} emptyMessage="No platform calls yet this month." />
          {data && <p className="mt-4 text-[12px] text-[#8a96c2]">{data.own_keys.headline}. {fmtCalls(data.own_keys.calls)} calls on your own keys.</p>}
        </Card>
      )}

      {tab === 'calls' && (
        <Card title="Calls" description="Recent proxy calls. Platform calls settle inside the plan. Own-key calls stay outside it.">
          <DataTable columns={callCols} data={history} emptyMessage="No calls recorded yet." />
        </Card>
      )}

      {tab === 'plans' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(data?.plans ?? []).map((plan) => {
            const current = data?.plan.id === plan.id;
            return (
              <div key={plan.id} className={`flex flex-col rounded-xl bg-[#131c39] p-5 ${plan.recommended ? 'border border-white' : 'border border-[#243365]/70'}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold tracking-tight">{plan.name}</h3>
                  {plan.recommended && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black">Most teams</span>}
                </div>
                <div className="mt-3 text-[32px] font-semibold tracking-tight">${plan.monthly_usd}<span className="text-[13px] font-medium text-[#8a96c2]"> / month</span></div>
                <p className="mt-1 text-[13px] text-[#a8b3d8]">{fmtCalls(plan.included_calls)} platform calls included</p>
                <ul className="mt-4 flex-1 space-y-2 text-[13px] text-[#c5cceb]">
                  {plan.includes.map((line) => <li key={line}>{line}</li>)}
                </ul>
                <Button className="mt-5" variant={current ? 'primary' : 'secondary'} fullWidth loading={busy === plan.id} onClick={() => choose(plan.id)}>
                  {current ? (data?.plan.selected ? 'Current plan' : 'Start here') : `Choose ${plan.name}`}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'streams' && (
        <div className="space-y-4">
          {mppSummary && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Open streams" value={`${mppSummary.streams_open}/${mppSummary.streams_total}`} />
              <StatCard label="Calls" value={fmtCalls(mppSummary.calls_total)} />
              <StatCard label="Tokens" value={fmtCalls(mppSummary.tokens_total)} />
              <StatCard label="Settled" value={`$${mppSummary.settled_usd.toFixed(2)}`} />
            </div>
          )}
          <Card title="Streams" description="An open MPP stream pays on the first request. Closed streams fall back to the plan balance.">
            {streams.length === 0 ? <p className="py-6 text-center text-[13px] text-[#8a96c2]">No streams yet.</p> : streams.map((stream, index) => (
              <div key={stream.id} className="flex items-center gap-4 border-b border-[#243365]/40 py-3 last:border-0">
                <RankMark rank={index + 1} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-white">{stream.agent_name || stream.agent_pubkey.slice(0, 8)}</span>
                    <Badge variant={stream.status === 'open' ? 'success' : 'neutral'}>{stream.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-[12px] text-[#8a96c2]">{stream.upstream} · {fmtCalls(stream.total_calls)} calls</p>
                </div>
                <div className="w-[108px]"><RatingMarks score={null} /></div>
                {stream.on_chain_signature && <a href={`https://explorer.solana.com/tx/${stream.on_chain_signature}?cluster=devnet`} target="_blank" rel="noreferrer" className="text-[12px] text-white hover:underline">View TX</a>}
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'balance' && !billing && <p className="text-[13px] text-[#8a96c2]">Prepaid balance is loading.</p>}

      {tab === 'balance' && billing && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard label="Prepaid balance" value={`$${billing.balance_usd.toFixed(2)}`} hint="Used after the monthly allowance" />
            <StatCard label="Recorded spend" value={`$${billing.total_spent_usd.toFixed(2)}`} hint="Audit figure, separate from the plan price" />
            <StatCard label="Free credit" value={`$${billing.free_credit_usd.toFixed(2)}`} />
          </div>
          <Card title="Add prepaid balance" description="The plan price still settles the month. Prepaid covers platform calls once the allowance is used.">
            <div className="flex items-end gap-2">
              <label className="block flex-1 text-[12px] text-[#8a96c2]">
                Amount in USD
                <input type="number" min="1" step="0.01" value={topupAmt} onChange={(e) => { setTopupAmt(e.target.value); setTopupMsg(''); setTopupOk(false); }} placeholder="10.00" className="mt-1.5 w-full rounded-lg border border-[#243365] bg-[#0e1631] px-3 py-2 text-[13px] text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10" />
              </label>
              <Button variant="primary" onClick={handleTopup} disabled={topupBusy || !topupAmt} loading={topupBusy}>Add funds</Button>
            </div>
            {topupMsg && <p className={`mt-3 text-[12px] ${topupOk ? 'text-emerald-400' : 'text-red-400'}`}>{topupMsg}</p>}
          </Card>
        </div>
      )}
    </div>
  );
};
