import { useState, useEffect, useMemo, useCallback } from 'react';
import { VaultItem, inferType } from '../types';
import { apiFetch, isAuthenticated, API_BASE } from '../lib/auth';

const UPSTREAM_META: Record<string, { name: string; domain: string; tags: string[] }> = {
  openai:    { name: 'OpenAI',          domain: 'openai.com',    tags: ['AI', 'PROD'] },
  anthropic: { name: 'Anthropic Claude', domain: 'anthropic.com', tags: ['AI', 'CLAUDE'] },
  helius:    { name: 'Helius RPC',       domain: 'helius.dev',    tags: ['RPC', 'SOLANA'] },
  mistral:   { name: 'Mistral AI',       domain: 'mistral.ai',    tags: ['AI'] },
  cohere:    { name: 'Cohere',           domain: 'cohere.ai',     tags: ['AI'] },
  groq:      { name: 'Groq',             domain: 'groq.com',      tags: ['AI', 'FAST'] },
};

interface BackendItem {
  upstream:  string;
  createdAt: number;
  updatedAt: number;
}

function userSecretLabel(slug: string): string {
  // pw__google → "google"   note__shopping → "shopping"
  const idx = slug.indexOf('__');
  return idx >= 0 ? slug.slice(idx + 2).replace(/_/g, ' ') : slug;
}

function backendItemToVault(item: BackendItem): VaultItem {
  const type = inferType(item.upstream);

  if (type === 'api_key') {
    const meta = UPSTREAM_META[item.upstream] ?? { name: item.upstream, domain: '', tags: ['KEY'] };
    return {
      id:          item.upstream,
      name:        meta.name,
      type:        'api_key',
      value:       `${API_BASE}/proxy/${item.upstream}/`,
      domain:      meta.domain,
      createdAt:   item.createdAt * 1000,
      lastUsedAt:  item.updatedAt  * 1000,
      tags:        [...meta.tags, 'VAULT'],
    };
  }

  // User-defined secret (password / note / env / ssh_key) — value is hidden
  return {
    id:          item.upstream,
    name:        userSecretLabel(item.upstream),
    type,
    value:       '••••••',
    createdAt:   item.createdAt * 1000,
    lastUsedAt:  item.updatedAt  * 1000,
    tags:        [type.replace('_', ' ')],
  };
}

export const useVaults = (searchQuery: string, _activeFilter: string) => {
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const loadFromAPI = useCallback(async () => {
    if (!isAuthenticated()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/manage/list');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: { items?: BackendItem[]; keys?: string[] } = await res.json();

      // Prefer the new `items` array (with metadata); fall back to plain key names
      if (data.items && data.items.length > 0) {
        setVaultItems(data.items.map(backendItemToVault));
      } else if (data.keys) {
        const now = Math.floor(Date.now() / 1000);
        setVaultItems(
          data.keys.map(k => backendItemToVault({ upstream: k, createdAt: now, updatedAt: now }))
        );
      } else {
        setVaultItems([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vault');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromAPI();
    const handler = () => loadFromAPI();
    window.addEventListener('ks-auth-changed', handler);
    return () => window.removeEventListener('ks-auth-changed', handler);
  }, [loadFromAPI]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return vaultItems;
    return vaultItems.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.domain?.toLowerCase().includes(q) ||
      item.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [vaultItems, searchQuery]);

  const addItem = useCallback(async (data: Partial<VaultItem> & { upstream?: string; rawKey?: string }) => {
    const upstream = (data.upstream ?? data.domain?.replace(/\.(com|ai|dev|org)$/, '') ?? 'custom').toLowerCase();
    const rawKey   = data.rawKey ?? data.value ?? '';
    if (!rawKey) return;

    try {
      const res = await apiFetch('/manage/store', {
        method: 'POST',
        body: JSON.stringify({ upstream, apiKey: rawKey }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Store failed' }));
        throw new Error((err as { detail: string }).detail);
      }
      await loadFromAPI();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store key');
      throw err;
    }
  }, [loadFromAPI]);

  const deleteItem = useCallback(async (id: string) => {
    setVaultItems(prev => prev.filter(i => i.id !== id));
    try {
      const res = await apiFetch(`/manage/secret/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      await loadFromAPI();
    }
  }, [loadFromAPI]);

  const decryptItem = useCallback(async (id: string): Promise<string> => {
    const res = await apiFetch(`/manage/decrypt/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Decrypt failed' }));
      throw new Error((err as { detail: string }).detail ?? 'Decrypt failed');
    }
    const data = await res.json();
    return data.key as string;
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setVaultItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const hasFav = item.tags.includes('FAVORITE');
      return { ...item, tags: hasFav ? item.tags.filter(t => t !== 'FAVORITE') : [...item.tags, 'FAVORITE'] };
    }));
  }, []);

  return {
    items:          filteredItems,
    allItems:       vaultItems,
    loading,
    error,
    addItem,
    deleteItem,
    decryptItem,
    toggleFavorite,
    refresh:        loadFromAPI,
  };
};
