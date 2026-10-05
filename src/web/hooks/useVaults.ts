/**
 * useVaults — Path A vault hook backed by the CF Worker + client-side crypto.
 *
 * State machine:
 *   - locked    → no PRF-derived master key in module state; user must
 *                 trigger `unlock()` to do a passkey ceremony
 *   - unlocked  → reads + writes go through `vault-session` (CF Worker R2)
 *
 * Device Vault (Path A) plus the Python `/manage/*` shim. Demo login lists
 * `/manage/vault` without a passkey unlock; reveal falls back to
 * `/manage/decrypt/{id}`. Use `getDecryptedKey(upstream)` when Device Vault
 * is unlocked and you need a raw key for `/proxy/*`.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { VaultItem, inferType } from '../types';
import { isAuthenticated, requestVaultUnlock, API_BASE, apiFetch } from '../lib/auth';
import {
  addEntry,
  removeEntry,
  listEntries,
  isVaultUnlocked,
  getDecryptedKey,
} from '../lib/vault-session';
import type { VaultEntry } from '../lib/vault';

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
    value: row.masked_value || `${API_BASE}/proxy/${upstream}/`,
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
          return;
        }
        const rows = (await r.json()) as Array<Parameters<typeof serverRowToVault>[0]>;
        const serverItems = (Array.isArray(rows) ? rows : []).map(serverRowToVault);
        const byId = new Map(serverItems.map((item) => [item.id, item]));
        for (const item of local) {
          if (!byId.has(item.id) && !byId.has(item.name)) byId.set(item.id, item);
        }
        setVaultItems([...byId.values()]);
      } catch {
        setVaultItems(local);
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
    return () => window.removeEventListener('ks-auth-changed', handler);
  }, [refresh]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return vaultItems;
    return vaultItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.domain?.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [vaultItems, searchQuery]);

  const addItem = useCallback(
    async (data: Partial<VaultItem> & { upstream?: string; rawKey?: string }) => {
      if (!isVaultUnlocked()) {
        try {
          await unlock();
        } catch {
          /* Demo / no passkey: still write the Python /manage shim. */
        }
      }
      const upstream = (data.upstream ?? data.domain?.replace(/\.(com|ai|dev|org)$/, '') ?? 'custom').toLowerCase();
      const rawKey = data.rawKey ?? data.value ?? '';
      if (!rawKey) return;
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
    [refresh, unlock],
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
    if (isVaultUnlocked()) {
      const key = getDecryptedKey(id);
      if (key) return key;
    }
    const r = await apiFetch(`/manage/decrypt/${encodeURIComponent(id)}`);
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'decrypt failed' }));
      throw new Error((err as { detail?: string }).detail ?? 'Vault locked — unlock first');
    }
    const data = await r.json();
    return String(data.value ?? '');
  }, []);

  return {
    items: filteredItems,
    allItems: vaultItems,
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
