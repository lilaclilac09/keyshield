/**
 * Vault list helpers — extension saves hit /manage/store; the dashboard
 * must show those rows when the user returns to Vault.
 */

import { catalogTags, providerMeta, vaultStoreName } from './provider-catalog';

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
  family?: string;
  product?: string;
  prefix?: string;
  domain?: string;
  notes?: string;
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

export function maskVaultPreview(value: string): string {
  const raw = String(value || '');
  if (raw.length <= 18) return raw;
  return `${raw.slice(0, 8)}••••${raw.slice(-4)}`;
}

/** Show queued detect hits on Vault before /manage/vault catches up. */
export function previewPendingVaultHits(hits: PendingVaultHit[]): VaultListRow[] {
  const out: VaultListRow[] = [];
  const seen = new Set<string>();
  for (const hit of hits || []) {
    const upstream = String(hit?.upstream || '').toLowerCase().trim();
    const value = String(hit?.value || hit?.key || '').trim();
    if (!upstream || !value) continue;
    const id = `${upstream}:${value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const meta = providerMeta(upstream);
    out.push({
      id: `pending-${out.length}-${upstream}`,
      name: vaultStoreName({ upstream, value }),
      upstream,
      masked_value: maskVaultPreview(value),
      prefix: maskVaultPreview(value),
      family: meta.family,
      product: meta.product,
      domain: meta.domain,
      tags: catalogTags(upstream),
    });
  }
  return out;
}

export function mergeVaultRows(server: VaultListRow[], pending: VaultListRow[]): VaultListRow[] {
  const rows = Array.isArray(server) ? server.slice() : [];
  const seen = new Set(
    rows.map((row) => `${String(row.upstream || '').toLowerCase()}:${String(row.masked_value || row.id || '')}`),
  );
  for (const row of pending || []) {
    const key = `${String(row.upstream || '').toLowerCase()}:${String(row.masked_value || row.id || '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

/** Cursor / site fill uses these raw values when /manage/vault is on another host. */
export function pendingHitsToFillKeys(
  hits: PendingVaultHit[],
  upstreams: string[],
): Array<{ id: string; upstream: string; name: string; value: string }> {
  const wanted = new Set((upstreams || []).map((u) => String(u || '').toLowerCase().trim()).filter(Boolean));
  const out: Array<{ id: string; upstream: string; name: string; value: string }> = [];
  const seen = new Set<string>();
  for (const hit of hits || []) {
    const upstream = String(hit?.upstream || '').toLowerCase().trim();
    const value = String(hit?.value || hit?.key || '').trim();
    if (!upstream || !value) continue;
    if (wanted.size && !wanted.has(upstream)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({
      id: `pending-${upstream}`,
      upstream,
      name: vaultStoreName({ upstream, value }),
      value,
    });
  }
  return out;
}

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
      body: JSON.stringify({
        upstream,
        apiKey: value,
        value,
        name: vaultStoreName({ upstream, value }),
      }),
    });
    if (r.ok) saved += 1;
  }
  if (saved > 0) emitVaultChanged();
  if (typeof window !== 'undefined') {
    try { window.postMessage({ __ks_pending_vault_cleared: true }, window.location.origin); } catch { /* noop */ }
  }
  return saved;
}
