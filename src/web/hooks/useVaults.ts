/**
 * useVaults — Path A vault hook backed by the CF Worker + client-side crypto.
 *
 * State machine:
 *   - locked    → no PRF-derived master key in module state; user must
 *                 trigger `unlock()` to do a passkey ceremony
 *   - unlocked  → reads + writes go through `vault-session` (CF Worker R2)
 *
 * The Python backend is no longer in the vault hot path — `/manage/*` is gone.
 * Use `getDecryptedKey(upstream)` (re-exported from vault-session) when you
 * need a raw key for a `/proxy/*` request.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { VaultItem, inferType } from '../types';
import { isAuthenticated, requestVaultUnlock, API_BASE } from '../lib/auth';
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
};

function userSecretLabel(slug: string): string {
  const idx = slug.indexOf('__');
  return idx >= 0 ? slug.slice(idx + 2).replace(/_/g, ' ') : slug;
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
    if (!isVaultUnlocked()) {
      setVaultItems([]);
      setUnlocked(false);
      return;
    }
    setUnlocked(true);
    setVaultItems(listEntries().map(entryToVault));
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
        await unlock();
        if (!isVaultUnlocked()) throw new Error('Vault still locked after unlock attempt');
      }
      const upstream = (data.upstream ?? data.domain?.replace(/\.(com|ai|dev|org)$/, '') ?? 'custom').toLowerCase();
      const rawKey = data.rawKey ?? data.value ?? '';
      if (!rawKey) return;
      await addEntry(upstream, rawKey);
      refresh();
    },
    [refresh, unlock],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      if (!isVaultUnlocked()) throw new Error('Vault locked');
      setVaultItems((prev) => prev.filter((i) => i.id !== id));
      try {
        await removeEntry(id);
      } catch {
        refresh();
      }
    },
    [refresh],
  );

  const decryptItem = useCallback(async (id: string): Promise<string> => {
    if (!isVaultUnlocked()) throw new Error('Vault locked — unlock first');
    const key = getDecryptedKey(id);
    if (!key) throw new Error(`No key for "${id}"`);
    return key;
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
