/**
 * useVaults — SQLite `/manage/*` vault.
 *
 * Detect + save POST `/manage/store` with the API key. List GET
 * `/manage/vault` (masked). Reveal GET `/manage/decrypt/{id}`. No
 * passkey / Device Vault unlock on this path.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { VaultItem, inferType } from '../types';
import { isAuthenticated, requestVaultUnlock, API_BASE, apiFetch } from '../lib/auth';
import {
  addEntry,
  removeEntry,
  listEntries,
  isVaultUnlocked,
} from '../lib/vault-session';
import type { VaultEntry } from '../lib/vault';
import {
  isVaultListPayload,
  parseVaultListPayload,
  previewPendingVaultHits,
  VAULT_CHANGED_EVENT,
  type PendingVaultHit,
} from '../lib/vault-list';

const UPSTREAM_META: Record<string, { name: string; domain: string; tags: string[] }> = {
  openai: { name: 'OpenAI', domain: 'openai.com', tags: ['AI', 'PROD'] },
  anthropic: { name: 'Anthropic Claude', domain: 'anthropic.com', tags: ['AI', 'CLAUDE'] },
  helius: { name: 'Helius RPC', domain: 'helius.dev', tags: ['RPC', 'SOLANA'] },
  mistral: { name: 'Mistral AI', domain: 'mistral.ai', tags: ['AI'] },
  cohere: { name: 'Cohere', domain: 'cohere.ai', tags: ['AI'] },
  groq: { name: 'Groq', domain: 'groq.com', tags: ['AI', 'FAST'] },
  openrouter: { name: 'OpenRouter', domain: 'openrouter.ai', tags: ['AI', 'NEMOTRON'] },
};

function userSecretLabel(slug: string): string {
  const idx = slug.indexOf('__');
  return idx >= 0 ? slug.slice(idx + 2).replace(/_/g, ' ') : slug;
}

function serverRowToVault(row: {
  id: string;
  name?: string;
  type?: string;
  upstream?: string;
  masked_value?: string;
  tags?: string[];
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
}): VaultItem {
  const upstream = (row.upstream || row.id || 'custom').toLowerCase();
  const type = inferType(upstream);
  const meta = UPSTREAM_META[upstream] ?? { name: row.name || upstream, domain: '', tags: ['KEY'] };
  const created = row.created_at ? Date.parse(row.created_at) : Date.now();
  const updated = row.updated_at ? Date.parse(row.updated_at) : created;
  return {
    id: row.id,
    name: row.name || meta.name,
    type,
    value: `${API_BASE}/proxy/${upstream}/`,
    domain: meta.domain,
    createdAt: Number.isFinite(created) ? created : Date.now(),
    lastUsedAt: Number.isFinite(updated) ? updated : Date.now(),
    tags: [...(Array.isArray(row.tags) ? row.tags : meta.tags), 'PROXY'],
    expiryDate: row.expires_at ?? undefined,
  };
}

function entryToVault(entry: VaultEntry): VaultItem {
  const type = inferType(entry.upstream);
  if (type === 'api_key') {
    const meta = UPSTREAM_META[entry.upstream] ?? { name: entry.upstream, domain: '', tags: ['KEY'] };
    return {
      id: entry.upstream,
      name: meta.name,
      type: 'api_key',
      value: `${API_BASE}/proxy/${entry.upstream}/`,
      domain: meta.domain,
      createdAt: entry.addedAt,
      lastUsedAt: entry.addedAt,
      tags: [...meta.tags, 'VAULT'],
    };
  }
  return {
    id: entry.upstream,
    name: userSecretLabel(entry.upstream),
    type,
    value: '••••••',
    createdAt: entry.addedAt,
    lastUsedAt: entry.addedAt,
    tags: [type.replace('_', ' ')],
  };
}

export const useVaults = (searchQuery: string, _activeFilter: string) => {
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [pendingHits, setPendingHits] = useState<PendingVaultHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<boolean>(isVaultUnlocked());

  const refresh = useCallback(() => {
    const unlockedNow = isVaultUnlocked();
    setUnlocked(unlockedNow);
    const local = unlockedNow ? listEntries().map(entryToVault) : [];
    void (async () => {
      try {
        const r = await apiFetch('/manage/vault');
        if (!r.ok) {
          setVaultItems(local);
          if (r.status >= 400 && local.length === 0) {
            setError(r.status === 401 ? 'sign in again to load vault' : `vault list failed (${r.status})`);
          }
          return;
        }
        const payload = await r.json();
        if (!isVaultListPayload(payload)) {
          setVaultItems(local);
          if (local.length === 0) setError('vault list failed');
          return;
        }
        const rows = parseVaultListPayload(payload);
        const serverItems = rows.map(serverRowToVault);
        setError(null);
        const byId = new Map(serverItems.map((item) => [item.id, item]));
        for (const item of local) {
          if (!byId.has(item.id) && !byId.has(item.name)) byId.set(item.id, item);
        }
        setVaultItems([...byId.values()]);
      } catch {
        setVaultItems(local);
        if (local.length === 0) setError('vault list failed');
      }
    })();
  }, []);

  const unlock = useCallback(async () => {
    if (!isAuthenticated()) {
      setError('log in first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestVaultUnlock();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vault unlock failed');
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('ks-auth-changed', handler);
    window.addEventListener(VAULT_CHANGED_EVENT, handler);
    window.addEventListener('focus', handler);
    document.addEventListener('visibilitychange', handler);
    return () => {
      window.removeEventListener('ks-auth-changed', handler);
      window.removeEventListener(VAULT_CHANGED_EVENT, handler);
      window.removeEventListener('focus', handler);
      document.removeEventListener('visibilitychange', handler);
    };
  }, [refresh]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || !e.data) return;
      if (Array.isArray(e.data.__ks_pending_vault)) {
        setPendingHits(e.data.__ks_pending_vault as PendingVaultHit[]);
      }
      if (e.data.__ks_pending_vault_cleared) setPendingHits([]);
      if (e.data.__ks_vault_changed) refresh();
    };
    window.addEventListener('message', onMsg);
    try { window.postMessage({ __ks_ext_request_pending_vault: true }, window.location.origin); } catch { /* noop */ }
    return () => window.removeEventListener('message', onMsg);
  }, [refresh]);

  const mergedItems = useMemo(() => {
    if (!pendingHits.length) return vaultItems;
    const pendingItems = previewPendingVaultHits(pendingHits).map(serverRowToVault);
    const seen = new Set(vaultItems.map((item) => `${item.name}:${item.value}`));
    const extra = pendingItems.filter((item) => !seen.has(`${item.name}:${item.value}`));
    return extra.length ? vaultItems.concat(extra) : vaultItems;
  }, [vaultItems, pendingHits]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return mergedItems;
    return mergedItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.domain?.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [mergedItems, searchQuery]);

  const addItem = useCallback(
    async (data: Partial<VaultItem> & { upstream?: string; rawKey?: string }) => {
      // Detect + save never prompts passkey. Reveal is GET /manage/decrypt.
      const upstream = (data.upstream ?? data.domain?.replace(/\.(com|ai|dev|org)$/, '') ?? 'custom').toLowerCase();
      const rawKey = data.rawKey ?? data.value ?? '';
      if (!rawKey) throw new Error('Paste the API key');
      if (isVaultUnlocked()) {
        await addEntry(upstream, rawKey);
      }
      const stored = await apiFetch('/manage/store', {
        method: 'POST',
        body: JSON.stringify({ upstream, apiKey: rawKey, name: data.name || upstream }),
      });
      if (!stored.ok) {
        const err = await stored.json().catch(() => ({ detail: 'store failed' }));
        throw new Error((err as { detail?: string }).detail ?? 'store failed');
      }
      refresh();
    },
    [refresh],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      setVaultItems((prev) => prev.filter((i) => i.id !== id));
      try {
        if (isVaultUnlocked()) await removeEntry(id);
      } catch {
        /* local device vault miss is fine */
      }
      const r = await apiFetch(`/manage/vault/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 404) {
        refresh();
        const err = await r.json().catch(() => ({ detail: 'delete failed' }));
        throw new Error((err as { detail?: string }).detail ?? 'delete failed');
      }
    },
    [refresh],
  );

  const decryptItem = useCallback(async (id: string): Promise<string> => {
    const r = await apiFetch(`/manage/decrypt/${encodeURIComponent(id)}`);
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'decrypt failed' }));
      throw new Error((err as { detail?: string; code?: string }).detail ?? 'Save the API key again');
    }
    const data = await r.json();
    const plaintext = String(data.value ?? data.key ?? '').trim();
    if (!plaintext) throw new Error('Save the API key again');
    return plaintext;
  }, []);

  return {
    items: filteredItems,
    allItems: mergedItems,
    loading,
    error,
    unlocked,
    unlock,
    addItem,
    deleteItem,
    decryptItem,
    refresh,
  };
};
