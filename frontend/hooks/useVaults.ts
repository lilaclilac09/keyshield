
import { useState, useEffect, useMemo } from 'react';
import { VaultItem } from '../types';

const INITIAL_DATA: VaultItem[] = [
  {
    id: '1',
    name: 'OpenAI API (Production)',
    type: 'api_key',
    value: 'sk-proj-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
    domain: 'openai.com',
    createdAt: Date.now() - 86400000,
    lastUsedAt: Date.now(),
    tags: ['AI', 'PROD'],
    notes: 'Primary production key for GPT-4 access'
  },
  {
    id: '2',
    name: 'Helius Mainnet-Beta',
    type: 'api_key',
    value: 'helius_auth_9921_x_112',
    domain: 'helius.dev',
    createdAt: Date.now() - 1200000,
    lastUsedAt: Date.now(),
    tags: ['RPC', 'SOLANA']
  },
  {
    id: '3',
    name: 'GitHub Webhook Secret',
    type: 'api_key',
    value: 'ghs_A1b2C3d4E5f6G7h8I9j0',
    domain: 'github.com',
    createdAt: Date.now() - 5000000,
    lastUsedAt: Date.now(),
    tags: ['WEBHOOK', 'CI/CD']
  },
  {
    id: '4',
    name: 'Stripe Secret Key',
    type: 'api_key',
    value: 'sk_live_51234567890',
    domain: 'stripe.com',
    createdAt: Date.now() - 10000000,
    lastUsedAt: Date.now(),
    tags: ['FINANCE']
  }
];

export const useVaults = (searchQuery: string, activeFilter: string) => {
  const [vaultItems, setVaultItems] = useState<VaultItem[]>(() => {
    const saved = localStorage.getItem('keyshield_vault');
    return saved ? JSON.parse(saved) : INITIAL_DATA;
  });

  useEffect(() => {
    localStorage.setItem('keyshield_vault', JSON.stringify(vaultItems));
  }, [vaultItems]);

  const filteredItems = useMemo(() => {
    return vaultItems.filter(item => {
      const matchesSearch = 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.domain?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));

      if (activeFilter === 'All Items') return matchesSearch;
      if (activeFilter === 'API Keys') return matchesSearch && item.type === 'api_key';
      if (activeFilter === 'Favorites') return matchesSearch && item.tags.includes('FAVORITE');
      
      return matchesSearch;
    });
  }, [vaultItems, searchQuery, activeFilter]);

  const addItem = (data: Partial<VaultItem>) => {
    const newItem: VaultItem = {
      id: Math.random().toString(36).substring(7),
      name: data.name || 'Unnamed Key',
      type: data.type || 'api_key',
      value: data.value || '',
      domain: data.domain,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      tags: data.tags || ['NEW'],
      notes: data.notes,
      expiryDate: data.expiryDate
    };
    setVaultItems(prev => [newItem, ...prev]);
  };

  const deleteItem = (id: string) => {
    setVaultItems(prev => prev.filter(item => item.id !== id));
  };

  const toggleFavorite = (id: string) => {
    setVaultItems(prev => prev.map(item => {
      if (item.id === id) {
        const hasFavorite = item.tags.includes('FAVORITE');
        return {
          ...item,
          tags: hasFavorite 
            ? item.tags.filter(t => t !== 'FAVORITE') 
            : [...item.tags, 'FAVORITE']
        };
      }
      return item;
    }));
  };

  return {
    items: filteredItems,
    allItems: vaultItems,
    addItem,
    deleteItem,
    toggleFavorite
  };
};
