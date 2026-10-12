/**
 * Vault list helpers — extension saves hit /manage/store; the dashboard
 * must show those rows when the user returns to Vault.
 */

export const VAULT_CHANGED_EVENT = 'ks-vault-changed';

export type VaultListRow = {
  id: string;
  name?: string;
  type?: string;
  upstream?: string;
  masked_value?: string;
  tags?: string[];
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
  cipher?: string;
  iv?: string;
  cipher_v?: number;
};

export function isVaultListPayload(data: unknown): boolean {
  if (Array.isArray(data)) return true;
  if (data && typeof data === 'object') {
    const rec = data as { items?: unknown; keys?: unknown };
    return Array.isArray(rec.items) || Array.isArray(rec.keys);
  }
  return false;
}

export function parseVaultListPayload(data: unknown): VaultListRow[] {
  if (Array.isArray(data)) return data as VaultListRow[];
  if (data && typeof data === 'object') {
    const rec = data as { items?: unknown; keys?: unknown };
    if (Array.isArray(rec.items)) return rec.items as VaultListRow[];
    if (Array.isArray(rec.keys)) return rec.keys as VaultListRow[];
  }
  return [];
}

export function shouldRefreshVaultOnVisit(section: string): boolean {
  return section === 'vault' || section === 'home';
}

export function isLocalApiBase(apiBase: string): boolean {
  try {
    const host = new URL(apiBase).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

export function emitVaultChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(VAULT_CHANGED_EVENT));
}

export type PendingVaultHit = { upstream?: string; value?: string; key?: string };

export async function flushPendingVaultHits(hits: PendingVaultHit[]): Promise<number> {
  const { apiFetch } = await import('./auth');
  let saved = 0;
  const seen = new Set<string>();
  for (const hit of hits || []) {
    const upstream = String(hit?.upstream || '').toLowerCase().trim();
    const value = String(hit?.value || hit?.key || '').trim();
    if (!upstream || !value) continue;
    const id = `${upstream}:${value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const r = await apiFetch('/manage/store', {
      method: 'POST',
      body: JSON.stringify({ upstream, apiKey: value, name: `${upstream} key` }),
    });
    if (r.ok) saved += 1;
  }
  if (saved > 0) emitVaultChanged();
  if (typeof window !== 'undefined') {
    try { window.postMessage({ __ks_pending_vault_cleared: true }, window.location.origin); } catch { /* noop */ }
  }
  return saved;
}
