/**
 * Per-caller usage and the call log (GET /usage/agents, GET /usage/calls).
 * Owner session only. All numbers come straight from the API; cost_usd is
 * KeyShield's estimate from token counts, not the provider's invoice.
 */
import { apiFetch } from './auth';

export type CallerKind = 'agent' | 'token' | 'owner' | 'unattributed';

export interface DailyPoint { day: string; calls: number; cost_usd: number }

export interface Caller {
  key: string;
  kind: CallerKind;
  name: string;
  agent_id?: number;
  pubkey_b58?: string | null;
  created_at?: number | null;
  registered?: boolean;
  token_ref?: string;
  calls: number;
  errors: number;
  cost_usd: number;
  last_ts: number | null;
  avg_latency_ms: number | null;
  daily: DailyPoint[];
}

export interface CallersResponse {
  days: number;
  since_ts: number;
  tracking_since_ts: number | null;
  callers: Caller[];
}

export interface CallRow {
  id: number;
  ts: number;
  upstream: string;
  model: string | null;
  method: string;
  path: string;
  status_code: number;
  latency_ms: number;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  key_type: string;
  actor: string | null;
  agent_id: number | null;
  token_ref: string | null;
}

export interface CallsPage {
  calls: CallRow[];
  total: number;
  next_before_id: number | null;
  upstreams: string[];
}

export interface CallFilters {
  caller: string;
  upstream?: string;
  status?: '' | 'ok' | 'error';
  since?: number;
  beforeId?: number | null;
  limit?: number;
}

async function readError(r: Response, fallback: string): Promise<Error> {
  const body = await r.json().catch(() => ({}));
  return new Error((body as { detail?: string; error?: string }).detail || (body as { error?: string }).error || `${fallback} (${r.status})`);
}

export async function fetchCallers(days = 30): Promise<CallersResponse> {
  const r = await apiFetch(`/usage/agents?days=${days}`);
  if (!r.ok) throw await readError(r, 'usage unavailable');
  return r.json();
}

export async function fetchCalls(f: CallFilters): Promise<CallsPage> {
  const q = new URLSearchParams({ caller: f.caller, limit: String(f.limit ?? 50) });
  if (f.upstream) q.set('upstream', f.upstream);
  if (f.status) q.set('status', f.status);
  if (f.since) q.set('since', String(f.since));
  if (f.beforeId) q.set('before_id', String(f.beforeId));
  const r = await apiFetch(`/usage/calls?${q.toString()}`);
  if (!r.ok) throw await readError(r, 'call log unavailable');
  return r.json();
}

// ── formatting ─────────────────────────────────────────────────────────────

export function fmtUsd(v: number | null | undefined): string {
  const n = Number(v || 0);
  if (n === 0) return '$0.00';
  if (Math.abs(n) < 0.0001) return '<$0.0001';
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtAgo(ts: number | null | undefined, now = Date.now() / 1000): string {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round(now - ts));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

export function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function isError(status: number): boolean {
  return status === 0 || status >= 400;
}
