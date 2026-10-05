/** Shared keychain detect + framework snippets. Matches extension + backend. */

import { API_BASE, apiFetch } from './auth';

export interface DetectedKey {
  upstream: string | null;
  matched: boolean;
  prefix: string | null;
}

export interface RpcCacheMethod {
  method: string;
  ttl_sec: number;
  cached: boolean;
}

export interface KeychainCallResult {
  upstream: string;
  path: string;
  live: boolean;
  status: number;
  cache: string;
  latency_ms: number;
  key_source: string;
  key_prefix: string;
}

export interface KeychainStoredApi {
  id: string;
  name: string;
  upstream: string;
  prefix: string;
}

export interface KeychainHome {
  wallet: {
    address: string | null;
    sol: number | null;
    sol_lamports: number | null;
    usdc: number | null;
    usdc_micro: number | null;
    cache: string;
    rpc: string;
    lowest_ttl_sec: number | null;
    error: string | null;
  };
  ledger: { balance_usd: number; free_credit_usd: number };
  apis: KeychainStoredApi[];
  connection: {
    api: boolean;
    autosign: boolean;
    autosign_pubkey: string | null;
    rpc: string;
    rpc_cached: boolean;
    lowest_ttl_sec: number | null;
    demo: boolean;
  };
  rpc_cache: { lowest_ttl_sec: number | null; writes_bypass: string[] };
}

const DETECTORS: { upstream: string; re: RegExp }[] = [
  { upstream: 'openrouter', re: /sk-or-[A-Za-z0-9_-]{12,}/ },
  { upstream: 'anthropic', re: /sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/ },
  { upstream: 'groq', re: /gsk_[A-Za-z0-9]{32,}/ },
  { upstream: 'helius', re: /helius_auth_[A-Za-z0-9]{16,}/ },
  { upstream: 'openai', re: /sk-(?:proj-|svcacct-|admin-)?(?!or-|ant-)[A-Za-z0-9_-]{20,}/ },
];

export function detectUpstream(raw: string): DetectedKey {
  const text = raw.trim();
  if (!text) return { upstream: null, matched: false, prefix: null };
  for (const row of DETECTORS) {
    const found = text.match(row.re);
    if (found) {
      const key = found[0];
      return { upstream: row.upstream, matched: true, prefix: `${key.slice(0, 6)}…${key.slice(-4)}` };
    }
  }
  return { upstream: null, matched: false, prefix: text.length > 8 ? `${text.slice(0, 4)}…` : '••••' };
}

export function extractDetectedKey(raw: string): string {
  const text = raw.trim();
  for (const row of DETECTORS) {
    const found = text.match(row.re);
    if (found) return found[0];
  }
  return text;
}

export function frameworkSnippets(upstream: string, token = '<TOKEN_HERE>', apiBase = API_BASE): Record<string, string> {
  const up = upstream || 'openrouter';
  const path = up === 'helius' ? '' : up === 'openai' ? 'v1/models' : up === 'openrouter' ? 'api/v1/chat/completions' : 'v1/models';
  const curl = up === 'helius'
    ? `curl -sS ${apiBase}/vproxy/helius/ \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}'`
    : `curl -sS ${apiBase}/vproxy/${up}/${path} \\\n  -H "Authorization: Bearer ${token}"`;
  const python = `from keyshield_sdk import KeyShield
ks = KeyShield(token="${token}")
# key stays in the vault — SDK only holds the session
r = ks.proxy("${up}", "${path or ''}", ${up === 'helius' ? 'json={"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}' : 'method="GET"'})
print(r.status_code, r.headers.get("x-ks-cache"))`;
  const js = `const r = await fetch("${apiBase}/vproxy/${up}/${path}", {
  method: "${up === 'helius' ? 'POST' : 'GET'}",
  headers: { Authorization: "Bearer ${token}", "Content-Type": "application/json" },
  ${up === 'helius' ? 'body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot", params: [] }),' : ''}
});
console.log(r.headers.get("x-ks-cache"), await r.json());`;
  return { curl, python, js };
}

export async function detectKeyOnServer(value: string): Promise<DetectedKey> {
  const r = await apiFetch('/keychain/detect', { method: 'POST', body: JSON.stringify({ value }) });
  if (!r.ok) throw new Error('detect failed');
  return r.json();
}

export async function fetchRpcCache(): Promise<{ methods: RpcCacheMethod[]; writes_bypass: string[]; lowest_ttl_sec: number | null }> {
  const r = await apiFetch('/keychain/rpc-cache');
  if (!r.ok) throw new Error('rpc-cache failed');
  return r.json();
}

export async function fetchKeychainHome(address?: string): Promise<KeychainHome> {
  const qs = address ? `?address=${encodeURIComponent(address)}` : '';
  const r = await apiFetch(`/keychain/home${qs}`);
  if (!r.ok) throw new Error('home failed');
  return r.json();
}

export async function storeDetectedKey(value: string, upstream?: string): Promise<{ stored: boolean; id: string; upstream: string; prefix: string }> {
  const r = await apiFetch('/keychain/store', {
    method: 'POST',
    body: JSON.stringify({ value, upstream }),
  });
  const body = await r.json().catch(() => ({ detail: 'store failed' }));
  if (!r.ok) throw new Error((body as { detail?: string }).detail ?? 'store failed');
  return body;
}

export async function callKeychain(upstream: string, prompt = 'KeyShield keychain ping'): Promise<KeychainCallResult> {
  const r = await apiFetch('/keychain/call', {
    method: 'POST',
    body: JSON.stringify({ upstream, prompt }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'keychain call failed' }));
    throw new Error((err as { detail?: string }).detail ?? 'keychain call failed');
  }
  return r.json();
}
