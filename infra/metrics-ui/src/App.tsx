import React, { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { parseMetrics, get, sum, type Sample } from './parse';

// ── config ───────────────────────────────────────────────────────────────────
const METRICS_URL = (() => {
  const base = import.meta.env.VITE_METRICS_URL ?? '';
  // Local dev: use Vite proxy to avoid CORS
  return base ? `${base}/metrics` : '/api/metrics';
})();
const TOKEN = import.meta.env.VITE_METRICS_TOKEN ?? '';
const POLL_MS = 15_000;
const HISTORY = 40; // points to keep in sparklines

// ── types ─────────────────────────────────────────────────────────────────────
interface Snapshot {
  ts: string;
  reqTotal: number;
  errTotal: number;
  latP50: number;
  activeSessions: number;
  vaultOps: number;
  authOk: number;
  authFail: number;
  topupUsd: number;
}

// ── fetch ────────────────────────────────────────────────────────────────────
async function fetchMetrics(): Promise<Sample[]> {
  const headers: Record<string, string> = {};
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const r = await fetch(METRICS_URL, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseMetrics(await r.text());
}

function toSnapshot(s: Sample[]): Snapshot {
  const now = new Date().toLocaleTimeString();
  const bucket = (name: string) => {
    const inf = get(s, name).find(x => x.labels['le'] === '+Inf');
    return inf?.value ?? 0;
  };
  const p50bucket = (name: string) => {
    const rows = get(s, name).sort((a, b) => parseFloat(a.labels['le'] ?? '0') - parseFloat(b.labels['le'] ?? '0'));
    const total = rows.find(x => x.labels['le'] === '+Inf')?.value ?? 0;
    const half = total / 2;
    for (const r of rows) { if (r.value >= half) return parseFloat(r.labels['le'] ?? '0'); }
    return 0;
  };
  return {
    ts: now,
    reqTotal: sum(s, 'ks_proxy_requests_total'),
    errTotal: sum(s, 'ks_proxy_requests_total', undefined) - sum(s, 'ks_proxy_requests_total', { status_code: '200' }),
    latP50: p50bucket('ks_proxy_latency_seconds_bucket'),
    activeSessions: sum(s, 'ks_active_sessions'),
    vaultOps: sum(s, 'ks_vault_ops_total'),
    authOk: sum(s, 'ks_auth_attempts_total', { result: 'success' }),
    authFail: sum(s, 'ks_auth_attempts_total', { result: 'failure' }),
    topupUsd: sum(s, 'ks_billing_topup_usd_total'),
  };
}

// ── ui helpers ────────────────────────────────────────────────────────────────
const C = { bg: '#0a0d1a', card: '#0f1527', border: '#1c2238', accent: '#5b8cff', green: '#4ade80', red: '#f87171', yellow: '#fbbf24', muted: '#71717a' };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? '#e4e4e7', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ── main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState('—');
  const [upstreams, setUpstreams] = useState<Record<string, number>>({});

  const poll = useCallback(async () => {
    try {
      const samples = await fetchMetrics();
      const snap = toSnapshot(samples);
      setHistory(h => [...h.slice(-(HISTORY - 1)), snap]);
      setLastFetch(new Date().toLocaleTimeString());
      setError('');
      // per-upstream breakdown
      const up: Record<string, number> = {};
      for (const s of get(samples, 'ks_proxy_requests_total')) {
        const u = s.labels['upstream'] ?? 'unknown';
        up[u] = (up[u] ?? 0) + s.value;
      }
      setUpstreams(up);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { poll(); const id = setInterval(poll, POLL_MS); return () => clearInterval(id); }, [poll]);

  const latest = history[history.length - 1];
  const prev = history[history.length - 2];
  const rps = latest && prev ? ((latest.reqTotal - prev.reqTotal) / (POLL_MS / 1000)).toFixed(2) : '—';

  const upstreamData = Object.entries(upstreams).map(([name, count]) => ({ name, count }));

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '24px 20px', fontFamily: 'system-ui, sans-serif', color: '#e4e4e7' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: error ? C.red : C.green }} />
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>KeyShield Metrics</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {error ? `Error: ${error}` : `Last update: ${lastFetch} · polling every ${POLL_MS / 1000}s`}
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px' }}>
          {METRICS_URL}
        </div>
      </div>

      {/* stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <Card title="Req / sec"><Stat label="throughput" value={rps} color={C.accent} /></Card>
        <Card title="Active Sessions"><Stat label="sessions" value={latest?.activeSessions ?? '—'} color={C.green} /></Card>
        <Card title="Auth Success"><Stat label="total" value={latest?.authOk ?? '—'} color={C.green} /></Card>
        <Card title="Auth Failures"><Stat label="total" value={latest?.authFail ?? '—'} color={latest?.authFail ? C.red : C.muted} /></Card>
        <Card title="Billing (USD)"><Stat label="total topped up" value={latest ? `$${latest.topupUsd.toFixed(2)}` : '—'} color={C.yellow} /></Card>
      </div>

      {/* charts row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Card title="Proxy Requests (total)">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={history}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={{ fill: C.muted, fontSize: 10 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: '#e4e4e7' }} />
              <Line type="monotone" dataKey="reqTotal" stroke={C.accent} dot={false} strokeWidth={2} name="requests" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Latency P50 (s)">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={history}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={{ fill: C.muted, fontSize: 10 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: '#e4e4e7' }} />
              <Line type="monotone" dataKey="latP50" stroke={C.yellow} dot={false} strokeWidth={2} name="p50 (s)" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* charts row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card title="Auth OK vs Fail">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={history}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={{ fill: C.muted, fontSize: 10 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: '#e4e4e7' }} />
              <Legend wrapperStyle={{ color: C.muted, fontSize: 11 }} />
              <Line type="monotone" dataKey="authOk" stroke={C.green} dot={false} strokeWidth={2} name="success" />
              <Line type="monotone" dataKey="authFail" stroke={C.red} dot={false} strokeWidth={2} name="failure" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Requests by Upstream">
          {upstreamData.length === 0
            ? <div style={{ color: C.muted, fontSize: 13, paddingTop: 60, textAlign: 'center' }}>No data yet</div>
            : <ResponsiveContainer width="100%" height={180}>
                <BarChart data={upstreamData} layout="vertical">
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fill: C.muted, fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} width={80} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: '#e4e4e7' }} />
                  <Bar dataKey="count" fill={C.accent} radius={[0, 4, 4, 0]} name="requests" />
                </BarChart>
              </ResponsiveContainer>
          }
        </Card>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: C.muted }}>
        KeyShield Metrics Dashboard · data from <code style={{ color: C.accent }}>{METRICS_URL}</code>
      </div>
    </div>
  );
}
