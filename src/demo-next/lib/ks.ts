import { attachGrantHeader } from './grant';

const TOKEN_KEY = 'ks_demo_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export async function ksFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  attachGrantHeader(path, headers);
  return fetch(`/ks${path}`, { ...init, headers });
}

export async function pingHealth(): Promise<number> {
  const t0 = performance.now();
  const r = await fetch('/ks/health', { cache: 'no-store' });
  if (!r.ok) throw new Error('health down');
  return Math.round(performance.now() - t0);
}

export async function ensureDemoSession(): Promise<string> {
  const existing = getToken();
  if (existing) return existing;
  const r = await fetch('/ks/auth/demo-session', { method: 'POST' });
  if (!r.ok) throw new Error('demo session failed — is KS_DEMO_MODE=1 on :8001?');
  const body = await r.json();
  const token = String(body.token || '');
  if (!token) throw new Error('demo session missing token');
  setToken(token);
  if (body.userId) localStorage.setItem('ks_demo_wallet', String(body.userId));
  return token;
}

export interface KeychainHome {
  wallet: {
    address: string | null;
    sol: number | null;
    usdc: number | null;
    rpc: string;
    cache: string;
    error: string | null;
  };
  ledger: { balance_usd: number; free_credit_usd: number };
  apis: { id: string; name: string; upstream: string; prefix: string }[];
  connection: { api: boolean; autosign: boolean; demo: boolean; lowest_ttl_sec: number | null };
  latency?: { wallet_ms: number; online: boolean };
}

export async function fetchHome(address?: string): Promise<KeychainHome> {
  const qs = address ? `?address=${encodeURIComponent(address)}` : '';
  const r = await ksFetch(`/keychain/home${qs}`);
  if (!r.ok) throw new Error('home failed');
  return r.json();
}

export async function demoTopup(amountUsd = 5): Promise<{ balance_usd: number }> {
  const r = await ksFetch('/billing/topup', {
    method: 'POST',
    body: JSON.stringify({ amount_usd: amountUsd }),
  });
  if (!r.ok) throw new Error('top-up failed');
  return r.json();
}

export async function decryptManaged(id: string): Promise<string | null> {
  const r = await ksFetch(`/manage/decrypt/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  const body = await r.json();
  return typeof body.value === 'string' ? body.value : null;
}

export async function listAgents(): Promise<{ name: string; pubkey_b58: string }[]> {
  const r = await ksFetch('/agents/list');
  if (!r.ok) return [];
  const body = await r.json();
  return Array.isArray(body.agents) ? body.agents : [];
}

export interface StreamLog {
  id: number;
  status: string;
  stream_pda?: string | null;
  pending_artifact_hash?: string | null;
  settled_micro_usdc?: number | null;
}

export async function listStreams(): Promise<StreamLog[]> {
  const r = await ksFetch('/mpp/streams');
  if (!r.ok) return [];
  const body = await r.json();
  return Array.isArray(body.streams) ? body.streams : [];
}

export function shortAddr(addr?: string | null): string {
  if (!addr) return '—';
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export function fmt(n: number | null | undefined, digits = 4): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
