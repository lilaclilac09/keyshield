import React, { useCallback, useEffect, useState } from 'react';
import { fetchCalls, fmtTime, fmtUsd, isError, type Caller, type CallsPage } from '../../lib/usage';

type Range = '24h' | '7d' | '30d' | 'all';
const RANGE_S: Record<Range, number> = { '24h': 86400, '7d': 7 * 86400, '30d': 30 * 86400, all: 0 };
const PAGE = 50;

export const CallLog: React.FC<{ caller: Caller; onBack: () => void }> = ({ caller, onBack }) => {
  const [status, setStatus] = useState<'' | 'ok' | 'error'>('');
  const [upstream, setUpstream] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [cursors, setCursors] = useState<(number | null)[]>([null]); // before_id per page
  const [page, setPage] = useState<CallsPage | null>(null);
  const [upstreams, setUpstreams] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cursor = cursors[cursors.length - 1];

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const since = RANGE_S[range] ? Math.floor(Date.now() / 1000) - RANGE_S[range] : undefined;
      const p = await fetchCalls({ caller: caller.key, status, upstream, since, beforeId: cursor, limit: PAGE });
      setPage(p);
      if (!upstream) setUpstreams(p.upstreams);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [caller.key, status, upstream, range, cursor]);

  useEffect(() => { void load(); }, [load]);

  const resetPaging = () => setCursors([null]);
  const pageIndex = cursors.length - 1;
  const from = page && page.calls.length ? pageIndex * PAGE + 1 : 0;
  const to = page ? pageIndex * PAGE + page.calls.length : 0;
  const filtered = status !== '' || upstream !== '' || range !== 'all';

  return (
    <div>
      <button className="back" onClick={onBack}>← All callers</button>
      <div className="sec-head" style={{ marginTop: 18 }}>
        <div>
          <div className="eyebrow">{caller.kind === 'agent' ? 'Agent' : caller.kind === 'token' ? 'Developer token' : caller.kind === 'owner' ? 'Owner' : 'History'}</div>
          <h2 style={{ marginTop: 10 }}>{caller.name}</h2>
          {caller.pubkey_b58 && <span className="c-sub">{caller.pubkey_b58}</span>}
        </div>
        <button className="btn sm" onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      <div className="filters" role="group" aria-label="Filter calls">
        <div className="seg" aria-label="Status">
          {([['', 'All'], ['ok', 'OK'], ['error', 'Errors']] as const).map(([v, l]) => (
            <button key={l} aria-pressed={status === v} onClick={() => { setStatus(v); resetPaging(); }}>{l}</button>
          ))}
        </div>
        <div className="seg" aria-label="Time range">
          {(['24h', '7d', '30d', 'all'] as Range[]).map((r) => (
            <button key={r} aria-pressed={range === r} onClick={() => { setRange(r); resetPaging(); }}>{r === 'all' ? 'All time' : r}</button>
          ))}
        </div>
        <label className="note" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          Provider
          <select value={upstream} onChange={(e) => { setUpstream(e.target.value); resetPaging(); }}>
            <option value="">All</option>
            {upstreams.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>

      {err && <p className="err">{err}</p>}

      {page && page.total === 0 && !loading && (
        <div className="empty">
          <p>{filtered ? 'No calls match these filters.' : caller.kind === 'unattributed' ? 'No older calls.' : 'No calls from this caller yet.'}</p>
          {!filtered && caller.kind === 'agent' && (
            <p>Calls show up here once the agent signs in with its key and calls <code>/vproxy</code> or <code>/proxy</code> with its token.</p>
          )}
        </div>
      )}

      {page && page.total > 0 && (
        <>
          <table className="log">
            <thead>
              <tr>
                <th>Time</th><th>Provider</th><th>Model</th><th>Status</th>
                <th className="num">Latency</th><th className="num">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {page.calls.map((c) => (
                <tr key={c.id}>
                  <td className="when mono" title={new Date(c.ts * 1000).toISOString()}>{fmtTime(c.ts)}</td>
                  <td>
                    {c.upstream}
                    <span className="path" title={`${c.method} ${c.path}`}>{c.method} {c.path}</span>
                  </td>
                  <td className="mono">{c.model || <span style={{ color: 'var(--faint)' }}>—</span>}</td>
                  <td><span className={`st ${isError(c.status_code) ? 'bad' : 'ok'}`}>{c.status_code || 'no reply'}</span></td>
                  <td className="num mono">{Math.round(c.latency_ms)} ms</td>
                  <td className="num mono" title={`${c.tokens_in} in / ${c.tokens_out} out tokens`}>{fmtUsd(c.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <span className="note">{from}–{to} of {page.total.toLocaleString()} calls</span>
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <button className="btn sm" disabled={pageIndex === 0 || loading} onClick={() => setCursors((c) => c.slice(0, -1))}>← Newer</button>
              <button className="btn sm" disabled={!page.next_before_id || loading} onClick={() => setCursors((c) => [...c, page.next_before_id])}>Older →</button>
            </span>
          </div>
        </>
      )}
      <p className="note" style={{ marginTop: 20 }}>
        Est. cost is KeyShield&apos;s estimate from the token counts in each response, not your provider&apos;s invoice. Only calls made with a KeyShield platform key are deducted from your balance; with your own key, the provider bills you directly.
      </p>
    </div>
  );
};
