import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { VaultItem, VaultItemType } from "../shared/types";

// --- Types ---

export interface VaultListResponse {
  items: VaultItem[];
}

export interface VaultDeleteResponse {
  success: boolean;
}

export interface VaultDecryptResponse {
  value: string;
}

// --- Key names ---

export const VAULT_KEYS = {
  list: ['vault', 'list'] as const,
  item: (id: string) => ['vault', 'item', id] as const,
  allTypes: ['vault', 'types'] as const,
};

// --- Query hooks ---

/** Fetch vault items with TanStack Query caching */
export function useVaultList(searchQuery?: string, selectedType?: string) {
  return useQuery({
    queryKey: VAULT_KEYS.list,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (selectedType && selectedType !== 'All Items') params.set('type', selectedType);
      const res = await fetch(`/api/vault/list?${params}`, { credentials: 'include' });
      const data = await res.json() as VaultItem[];
      return data;
    },
    staleTime: 5_000,
    gcTime: 300_000,
  });
}

/** Fetch a single vault item (decrypted) */
export function useVaultItem(id: string) {
  return useQuery({
    queryKey: VAULT_KEYS.item(id),
    queryFn: async () => {
      const res = await fetch(`/api/vault/${id}/decrypt`, { credentials: 'include' });
      return res.json() as Promise<VaultDecryptResponse>;
    },
    enabled: !!id,
    staleTime: 10_000,
  });
}

/** Delete a vault item */
export function useVaultDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/vault/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete item');
      return res.json() as Promise<VaultDeleteResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.list });
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.allTypes });
    },
  });
}

/** Add a new vault item */
export function useVaultAdd() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: Omit<VaultItem, 'id'>) => {
      const res = await fetch('/api/vault/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error('Failed to add item');
      return res.json() as Promise<VaultItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.list });
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.allTypes });
    },
  });
}
