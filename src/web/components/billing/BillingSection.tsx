/**
 * Billing & usage (v3). Real data only:
 *   GET /billing/balance, /billing/plan, /usage/agents, /billing/topup-history, /mpp/streams
 * Drill-down per caller uses GET /usage/calls.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './billing.css';
import { apiFetch } from '../../lib/auth';
import { fetchCallers, fmtAgo, fmtUsd, type Caller, type CallersResponse } from '../../lib/usage';
import { CallLog } from './CallLog';
import { WalletPanel } from './WalletPanel';

interface Balance { balance_usd: number; total_spent_usd: number; free_credit_usd?: number }
interface Topup { tx_signature: string; chain: string; asset: string; amount_usd: number; credited_at: number }
interface MppSummary { streams_total: number; streams_open: number; calls_total: number; settled_usd: number; pending_usd: number }
interface PlanSnap { plan?: { id: string; name: string; billing?: string; monthly_usd?: number } }

const nav = (id: string) => window.dispatchEvent(new CustomEvent('ks-nav', { detail: id }));

const Spark: React.FC<{ caller: Caller }> = ({ caller }) => {
  const pts = caller.daily;
  const max = Math.max(1, ...pts.map((p) => p.calls));
  const w = 132, h = 28, gap = 1;
  const bw = Math.max(1, (w - gap * (pts.length - 1)) / pts.length);
  const total = pts.reduce((s, p) => s + p.calls, 0);
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={`${total} calls in the last ${pts.length} days`}>
      {pts.map((p, i) => {
        const bh = p.calls ? Math.max(3, (p.calls / max) * h) : 1;
        return <rect key={p.day} className={p.calls ? '' : 'z'} x={i * (bw + gap)} y={h - bh} width={bw} height={bh}><title>{`${p.day}: ${p.calls} calls, ${fmtUsd(p.cost_usd)}`}</title></rect>;
      })}
    </svg>
  );
};

function sub(c: Caller): string {
  if (c.kind === 'agent') return c.registered === false ? 'removed agent' : (c.pubkey_b58 ? `${c.pubkey_b58.slice(0, 6)}…${c.pubkey_b58.slice(-4)}` : 'agent');
  if (c.kind === 'token') return 'proxy-only developer token';
  if (c.kind === 'owner') return 'calls made with a dashboard / owner token';
  return 'logged before per-agent tracking';
}

export const BillingSection: React.FC = () => {
  const [usage, setUsage] = useState<CallersResponse | null>(null);
  const [usageErr, setUsageErr] = useState<string | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [plan, setPlan] = useState<PlanSnap | null>(null);
  const [topups, setTopups] = useState<Topup[] | null>(null);
  const [mpp, setMpp] = useState<MppSummary | null>(null);
  const [open, setOpen] = useState<Caller | null>(null);

  const load = useCallback(async () => {
    setUsageErr(null);
    const [u, b, p, t, m] = await Promise.allSettled([
      fetchCallers(30),
      apiFetch('/billing/balance').then((r) => (r.ok ? r.json() : null)),
      apiFetch('/billing/plan').then((r) => (r.ok ? r.json() : null)),
      apiFetch('/billing/topup-history?limit=20').then((r) => (r.ok ? r.json() : null)),
      apiFetch('/mpp/streams').then((r) => (r.ok ? r.json() : null)),
    ]);
    if (u.status === 'fulfilled') setUsage(u.value); else setUsageErr(u.reason instanceof Error ? u.reason.message : 'usage unavailable');
    if (b.status === 'fulfilled') setBalance(b.value);
    if (p.status === 'fulfilled') setPlan(p.value);
    if (t.status === 'fulfilled') setTopups(t.value?.topups ?? []);
    if (m.status === 'fulfilled') setMpp(m.value?.summary ?? null);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(
    () => (usage?.callers ?? []).filter((c) => c.kind === 'agent' || c.calls > 0),
    [usage],
  );
  const totals = useMemo(() => {
    const all = usage?.callers ?? [];
    return {
      calls: all.reduce((s, c) => s + c.daily.reduce((a, d) => a + d.calls, 0), 0),
      cost: all.reduce((s, c) => s + c.daily.reduce((a, d) => a + d.cost_usd, 0), 0),
    };
  }, [usage]);

  if (open) {
    return (
      <div className="ksb"><div className="ksb-wrap"><CallLog caller={open} onBack={() => setOpen(null)} /></div></div>
    );
  }

  return (
    <div className="ksb">
      <div className="ksb-wrap">
        <div className="eyebrow">Billing &amp; usage</div>
        <h1>What your agents <em>spent.</em></h1>
        <p className="lede">Every proxy call, by the agent or token that made it, with your balance and payments below.</p>

        <dl className="figs">
          <div className="fig">
            <dt>Balance</dt>
            <dd>{balance ? fmtUsd(balance.balance_usd) : '—'}
              <small>{balance?.free_credit_usd ? `includes ${fmtUsd(balance.free_credit_usd)} starter credit` : 'prepaid ledger'}</small>
            </dd>
          </div>
          <div className="fig">
            <dt>Calls · 30 days</dt>
            <dd>{usage ? totals.calls.toLocaleString() : '—'}<small>through the proxy</small></dd>
          </div>
          <div className="fig">
            <dt>Est. cost · 30 days</dt>
            <dd>{usage ? fmtUsd(totals.cost) : '—'}<small>from response token counts</small></dd>
          </div>
          <div className="fig">
            <dt>Plan</dt>
            <dd>{plan?.plan?.name ?? '—'}<small>{plan?.plan ? (plan.plan.monthly_usd ? `$${plan.plan.monthly_usd}/mo, then pay as you go` : 'pay as you go') : ''}</small></dd>
          </div>
        </dl>

        <section>
          <div className="sec-head">
            <h2>Agents and tokens</h2>
            <button className="btn sm" onClick={() => void load()}>Refresh</button>
          </div>
          {usageErr && <p className="err">{usageErr}</p>}
          {usage && shown.length === 0 && (
            <div className="empty">
              <p>No agents yet, and no proxy calls on this account.</p>
              <p>Register an agent on the <button className="link" onClick={() => nav('agents')}>Agents</button> page or create a proxy-only token under <button className="link" onClick={() => nav('developer')}>Developer</button>. Its calls will show up here.</p>
            </div>
          )}
          {shown.length > 0 && (
            <>
              <div className="callers-head" aria-hidden="true">
                <span>Caller</span><span>Daily calls</span><span>Calls</span><span>Est. cost</span><span>Last call</span><span />
              </div>
              <ul className="callers">
                {shown.map((c) => (
                  <li key={c.key}>
                    <button className="caller" onClick={() => setOpen(c)} aria-label={`Open call log for ${c.name}`}>
                      <span style={{ minWidth: 0 }}>
                        <span className="c-name">{c.name}</span>
                        <span className="c-sub">{sub(c)}</span>
                      </span>
                      <span className="spark-cell"><Spark caller={c} /></span>
                      <span className="c-nums">
                        <span className="c-num">{c.calls.toLocaleString()}<small>{c.errors ? `${c.errors} failed` : 'all time'}</small></span>
                        <span className="c-num">{fmtUsd(c.cost_usd)}<small>all time</small></span>
                        <span className="c-num" title={c.last_ts ? new Date(c.last_ts * 1000).toLocaleString() : undefined}>{fmtAgo(c.last_ts)}<small>last call</small></span>
                      </span>
                      <span className="c-go" aria-hidden="true">→</span>
                    </button>
                  </li>
                ))}
              </ul>
              {shown.some((c) => c.kind === 'unattributed') && (
                <p className="note">Calls logged before per-agent tracking was added can&apos;t be tied to an agent, so they&apos;re grouped as history.</p>
              )}
            </>
          )}
        </section>

        <section>
          <div className="sec-head"><h2>Wallet and funds</h2></div>
          <WalletPanel onCredited={() => void load()} />
        </section>

        <section>
          <div className="sec-head"><h2>Payments</h2></div>
          {topups && topups.length === 0 && (
            <div className="empty">
              <p>No payments on this account yet.</p>
              <p>Top-ups you make with SOL or USDC are listed here once the server has verified them on-chain.</p>
            </div>
          )}
          {topups && topups.length > 0 && (
            <ul className="rows">
              {topups.map((t) => (
                <li key={t.tx_signature}>
                  <span><b>{fmtUsd(t.amount_usd)}</b> <span className="note">in {t.asset} · {t.chain}</span></span>
                  <span className="note">
                    {new Date(t.credited_at * 1000).toLocaleString()} ·{' '}
                    <a className="mono" href={`https://explorer.solana.com/tx/${t.tx_signature}${t.chain.includes('mainnet') ? '' : '?cluster=devnet'}`} target="_blank" rel="noreferrer">
                      {t.tx_signature.slice(0, 8)}…
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="note" style={{ marginTop: 18 }}>
            {mpp && mpp.streams_total > 0
              ? <>Metered payment streams: {mpp.streams_total} ({mpp.streams_open} open), {fmtUsd(mpp.settled_usd)} settled, {fmtUsd(mpp.pending_usd)} pending. </>
              : <>No metered payment streams. </>}
            <button className="link" onClick={() => nav('mpp')}>MPP streams (devnet tools)</button>
          </p>
        </section>
      </div>
    </div>
  );
};
