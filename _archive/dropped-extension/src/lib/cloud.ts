/**
 * cloud.ts — Talk directly to the KeyShield backend (port 8000)
 *
 * This bypasses Lit / Phantom entirely when a session token is present.
 * It's how the popup's "auto-detect → auto-store" promise actually works.
 *
 * Token discovery:
 *   - Dashboard at http://localhost:3000 writes localStorage.ks_token on login.
 *   - A content script branch reads it and forwards to background via
 *     KS_TOKEN_SYNC message.
 *   - Background persists in chrome.storage.local under 'ks_cloud_token'.
 *
 * After that, every STORE_KEY hits /manage/store directly. Zero Phantom prompt,
 * zero new tab, zero user click.
 */

const KS_BASE = 'http://localhost:8000';

// Keys handled by the backend (must match server.py UPSTREAMS)
const KNOWN_UPSTREAMS = new Set([
  'openai', 'anthropic', 'mistral', 'cohere', 'groq', 'helius',
  '0x', 'titan', 'pyth', 'alchemy',
]);

// Provider aliases → backend upstream names
const PROVIDER_TO_UPSTREAM: Record<string, string> = {
  openai:    'openai',
  anthropic: 'anthropic',
  claude:    'anthropic',
  mistral:   'mistral',
  cohere:    'cohere',
  groq:      'groq',
  helius:    'helius',
  '0x':      '0x',
  zerox:     '0x',
  titan:     'titan',
  pyth:      'pyth',
  alchemy:   'alchemy',
};

export function providerToUpstream(provider: string | undefined | null): string | null {
  if (!provider) return null;
  const k = provider.toLowerCase().trim();
  if (KNOWN_UPSTREAMS.has(k)) return k;
  return PROVIDER_TO_UPSTREAM[k] ?? null;
}

// ── Token storage ────────────────────────────────────────────────────────────

export async function getCloudToken(): Promise<string | null> {
  const { ks_cloud_token } = await chrome.storage.local.get('ks_cloud_token');
  return (ks_cloud_token as string) || null;
}

export async function setCloudToken(token: string): Promise<void> {
  await chrome.storage.local.set({ ks_cloud_token: token });
}

export async function clearCloudToken(): Promise<void> {
  await chrome.storage.local.remove('ks_cloud_token');
}

// ── API helpers ──────────────────────────────────────────────────────────────

interface CloudResult<T = unknown> {
  ok: boolean;
  data?: T;
  status?: number;
  error?: string;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<CloudResult> {
  const token = await getCloudToken();
  if (!token) return { ok: false, error: 'no-token' };

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  try {
    const r = await fetch(`${KS_BASE}${path}`, { ...init, headers });
    if (r.status === 401) {
      await clearCloudToken();
      return { ok: false, status: 401, error: 'token-expired' };
    }
    if (!r.ok) {
      const text = await r.text();
      return { ok: false, status: r.status, error: text.slice(0, 200) };
    }
    return { ok: true, data: await r.json() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function cloudStore(upstream: string, apiKey: string): Promise<CloudResult> {
  const u = providerToUpstream(upstream);
  if (!u) return { ok: false, error: `unknown provider: ${upstream}` };
  return authFetch('/manage/store', {
    method: 'POST',
    body: JSON.stringify({ upstream: u, apiKey }),
  });
}

export async function cloudList(): Promise<CloudResult<{ keys: string[]; items: any[] }>> {
  return authFetch('/manage/list', { method: 'GET' }) as Promise<any>;
}

export async function cloudDecrypt(upstream: string): Promise<CloudResult<{ key: string }>> {
  const u = providerToUpstream(upstream);
  if (!u) return { ok: false, error: `unknown provider: ${upstream}` };
  return authFetch(`/manage/decrypt/${u}`, { method: 'GET' }) as Promise<any>;
}

export async function cloudDelete(upstream: string): Promise<CloudResult> {
  const u = providerToUpstream(upstream);
  if (!u) return { ok: false, error: `unknown provider: ${upstream}` };
  return authFetch(`/manage/secret/${u}`, { method: 'DELETE' });
}

export async function cloudHealth(): Promise<CloudResult<{ status: string; version: string }>> {
  try {
    const r = await fetch(`${KS_BASE}/health`);
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: await r.json() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function isCloudReady(): Promise<boolean> {
  const t = await getCloudToken();
  if (!t) return false;
  const h = await cloudHealth();
  return h.ok;
}
