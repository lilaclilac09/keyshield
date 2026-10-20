import React, { useCallback, useEffect, useState } from 'react';
import { Card, StatCard } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { DataTable, Column } from '../ui/DataTable';
import { apiFetch } from '../../lib/auth';

/** One caller row from GET /usage/agents (agent, developer token, owner, ...). */
interface Caller {
  key: string; kind: string; name: string; agent_id: number | null; pubkey_b58?: string | null;
  token_ref?: string | null; calls: number; errors: number; cost_usd: number;
  last_ts: number | null; avg_latency_ms: number | null;
  daily: { day: string; calls: number; cost_usd: number }[];
}
/** One row from GET /usage/calls. */
interface CallRow {
  id: number; ts: number; upstream: string; model: string; method: string; path: string;
  status_code: number; latency_ms: number; cost_usd: number; tokens_in: number; tokens_out: number;
}

const PAGE = 25;
const fmtTs = (ts: number) => new Date(ts * 1000).toLocaleString();
const fmtCost = (c: number) => `$${(c || 0).toFixed(4)}`;
const kindLabel = (k: string) => ({ agent: 'Agent', token: 'Developer token', owner: 'Owner session', anonymous: 'Unattributed' } as Record<string, string>)[k] ?? k;
const selectCls = 'bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:ring-1 focus:ring-white/10';
const RANGES: { id: string; label: string; secs: number }[] = [
  { id: '1', label: 'Last 24 hours', secs: 86400 },
  { id: '7', label: 'Last 7 days', secs: 7 * 86400 },
  { id: '30', label: 'Last 30 days', secs: 30 * 86400 },
  { id: 'all', label: 'All time', secs: 0 },
];

/** Tiny bar strip of daily calls, in the dashboard's existing palette. */
const DailyBars: React.FC<{ daily: Caller['daily'] }> = ({ daily }) => {
  const max = Math.max(1, ...daily.map(d => d.calls));
  return (
    <div className="flex items-end gap-[2px] h-5" title="Calls per day, last 30 days">
      {daily.map(d => (
        <span key={d.day} title={`${d.day}: ${d.calls} calls`} className={d.calls ? 'w-[3px] bg-[#a8b3d8]' : 'w-[3px] bg-[#243365]'} style={{ height: d.calls ? `${Math.max(15, (d.calls / max) * 100)}%` : '2px' }} />
      ))}
    </div>
  );
};

const CallLog: React.FC<{ caller: Caller; onBack: () => void }> = ({ caller, onBack }) => {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [upstreams, setUpstreams] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [upstream, setUpstream] = useState('');
  const [range, setRange] = useState('30');
  const [cursors, setCursors] = useState<(number | null)[]>([null]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (before: number | null) => {
    setLoading(true); setErr('');
    const q = new URLSearchParams({ caller: caller.key, limit: String(PAGE) });
    if (status) q.set('status', status);
    if (upstream) q.set('upstream', upstream);
    const r = RANGES.find(x => x.id === range);
    if (r && r.secs) q.set('since', String(Math.floor(Date.now() / 1000) - r.secs));
    if (before) q.set('before_id', String(before));
    try {
      const res = await apiFetch(`/usage/calls?${q}`);
      if (!res.ok) { setErr(`Could not load calls (HTTP ${res.status}).`); setRows([]); return; }
      const j = await res.json();
      setRows(j.calls || []); setTotal(j.total || 0); setNext(j.next_before_id ?? null);
      if (Array.isArray(j.upstreams)) setUpstreams(j.upstreams);
    } catch { setErr('Could not load calls.'); }
    finally { setLoading(false); }
  }, [caller.key, status, upstream, range]);

  useEffect(() => { setCursors([null]); void load(null); }, [load]);

  const page = cursors.length - 1;
  const cols: Column<CallRow>[] = [
    { header: 'Time', render: c => <span className="text-[#5e6a91]">{fmtTs(c.ts)}</span>, className: '1.3fr' },
    { header: 'Provider', render: c => <span><span className="text-white">{c.upstream}</span><span className="block font-mono text-[10px] text-[#5e6a91] truncate">{c.method} {c.path}</span></span>, className: '1.6fr' },
    { header: 'Model', render: c => <span className="font-mono text-[11px] text-[#a8b3d8] break-all">{c.model || '—'}</span>, className: '1.6fr' },
    { header: 'Status', render: c => <Badge variant={c.status_code >= 200 && c.status_code < 400 ? 'success' : 'danger'}>{c.status_code}</Badge>, className: '0.7fr' },
    { header: 'Latency', render: c => <span className="text-[#8a96c2]">{Math.round(c.latency_ms)}ms</span>, className: '0.7fr' },
    { header: 'Cost', render: c => <span className={c.cost_usd > 0 ? 'text-white' : 'text-[#5e6a91]'}>{fmtCost(c.cost_usd)}</span>, className: '0.8fr' },
  ];

  return (
    <Card
      title={`Call log · ${caller.name}`}
      description={`${kindLabel(caller.kind)}${caller.pubkey_b58 ? ` · ${caller.pubkey_b58}` : ''}`}
      headerRight={<Button variant="ghost" size="sm" onClick={onBack}>← All callers</Button>}
    >
      <div className="flex flex-wrap gap-2 mb-3">
        <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls} aria-label="Status">
          <option value="">All statuses</option><option value="ok">OK only</option><option value="error">Errors only</option>
        </select>
        <select value={range} onChange={e => setRange(e.target.value)} className={selectCls} aria-label="Time range">
          {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <select value={upstream} onChange={e => setUpstream(e.target.value)} className={selectCls} aria-label="Provider">
          <option value="">All providers</option>
          {upstreams.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      {err ? <p className="text-[12px] text-red-400 py-6 text-center">{err}</p> : (
        <DataTable columns={cols} data={rows} emptyMessage={loading ? 'Loading…' : 'No calls match these filters.'} />
      )}
      <div className="flex items-center justify-between mt-3 text-[11px] text-[#5e6a91]">
        <span>{total ? `${page * PAGE + 1}–${page * PAGE + rows.length} of ${total.toLocaleString()} calls` : ''}</span>
        <div className="flex gap-2">
          <Button size="sm" disabled={page === 0 || loading} onClick={() => { const c = cursors.slice(0, -1); setCursors(c); void load(c[c.length - 1]); }}>← Newer</Button>
          <Button size="sm" disabled={!next || loading} onClick={() => { setCursors([...cursors, next]); void load(next); }}>Older →</Button>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-[#5e6a91]">Cost is KeyShield's estimate from response token counts. Only calls made with a platform key are deducted from your balance.</p>
    </Card>
  );
};

/** "Per Agent" tab inside the Payments page: spend and calls per agent/token, with a drill-down call log. */
export const AgentSpendTab: React.FC = () => {
  const [callers, setCallers] = useState<Caller[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<Caller | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await apiFetch('/usage/agents?days=30');
      if (!res.ok) { setErr(`Could not load per-agent usage (HTTP ${res.status}).`); return; }
      const j = await res.json();
      setCallers((j.callers || []).filter((c: Caller) => c.kind === 'agent' || c.calls > 0));
    } catch { setErr('Could not load per-agent usage.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  if (open) return <CallLog caller={open} onBack={() => setOpen(null)} />;

  const totalCalls = callers.reduce((s, c) => s + c.calls, 0);
  const totalErr = callers.reduce((s, c) => s + c.errors, 0);
  const totalCost = callers.reduce((s, c) => s + c.cost_usd, 0);
  const cols: Column<Caller & { id: string }>[] = [
    { header: 'Caller', render: c => <span><span className="text-white">{c.name}</span><span className="block text-[10px] text-[#5e6a91]">{kindLabel(c.kind)}</span></span>, className: '1.6fr' },
    { header: 'Daily calls (30d)', render: c => <DailyBars daily={c.daily || []} />, className: '1.4fr' },
    { header: 'Calls', render: c => <span className="text-white">{c.calls.toLocaleString()}{c.errors ? <span className="text-red-400 text-[11px]"> · {c.errors} failed</span> : null}</span> },
    { header: 'Cost', render: c => <span className={c.cost_usd > 0 ? 'text-white' : 'text-[#5e6a91]'}>{fmtCost(c.cost_usd)}</span> },
    { header: 'Last call', render: c => <span className="text-[#5e6a91]">{c.last_ts ? fmtTs(c.last_ts) : 'Never'}</span>, className: '1.3fr' },
    { header: '', render: c => <Button size="sm" variant="ghost" onClick={() => setOpen(c)} disabled={!c.calls}>Calls →</Button>, className: '0.8fr' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Calls (30d)" value={totalCalls.toLocaleString()} />
        <StatCard label="Failed (30d)" value={totalErr.toLocaleString()} />
        <StatCard label="Est. Cost (30d)" value={fmtCost(totalCost)} />
      </div>
      <Card
        title="Spend per Agent"
        description="Proxy calls in the last 30 days, by the agent or developer token that made them"
        headerRight={<button onClick={refresh} className="text-[#8a96c2] hover:text-white" aria-label="Refresh"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}><path d="M21 12a9 9 0 11-6.2-8.6"/><path d="M21 3v6h-6"/></svg></button>}
      >
        {err ? <p className="text-[12px] text-red-400 py-6 text-center">{err}</p> : (
          <DataTable columns={cols} data={callers.map(c => ({ ...c, id: c.key }))} emptyMessage={loading ? 'Loading…' : 'No agents or tokens yet. Register an agent or create a developer token, and its calls will show up here.'} />
        )}
      </Card>
    </div>
  );
};
