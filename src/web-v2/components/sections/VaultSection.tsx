import React from 'react';
import { Key, Plus } from 'lucide-react';
import type { VaultItem } from '../../types';
import { VaultItemCard } from '../VaultItemCard';
import { StatCard } from '../ui/Card';

interface Props {
  items: VaultItem[]; total: number; searchQuery: string;
  onAdd: () => void; onDelete: (id: string) => void; onDecrypt: (id: string) => Promise<string>;
  isLoading?: boolean;
}

export const VaultSection: React.FC<Props> = ({ items, total, searchQuery, onAdd, onDelete, onDecrypt, isLoading }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <StatCard label="Total Secrets" value={total} hint="encrypted with AES-256-GCM" />
      <StatCard label="Used This Week" value={items.filter(i => Date.now() - i.lastUsedAt < 86400000 * 7).length} hint="across agents and apps" />
      <StatCard label="Expiring Soon" value={items.filter(i => { if (!i.expiryDate) return false; const d = (new Date(i.expiryDate).getTime() - Date.now()) / 86400000; return d >= 0 && d <= 14; }).length} hint="within 14 days" />
    </div>
    {items.length === 0 ? (
      <div className="rounded-[3px] border border-dashed border-zinc-800/50 py-24 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-[3px] bg-[#0a0a0a] border border-zinc-800/50 flex items-center justify-center mb-4">
          <Key size={20} className="text-white" strokeWidth={1.75} />
        </div>
        <p className="text-[14px] text-zinc-300 font-medium">{searchQuery ? 'No secrets match your search' : 'Your vault is empty'}</p>
        <p className="text-[12px] text-zinc-500 mt-1 mb-5">{searchQuery ? '' : 'Add your first encrypted secret to get started'}</p>
        {!searchQuery && (
          <button onClick={onAdd} className="h-9 px-4 rounded-[2px] bg-white hover:bg-zinc-200 text-black text-[13px] font-semibold uppercase tracking-wider inline-flex items-center gap-2 transition-colors">
            <Plus size={14} /> Add Secret
          </button>
        )}
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map(item => <VaultItemCard key={item.id} item={item} onDelete={onDelete} onDecrypt={onDecrypt} />)}
      </div>
    )}
  </div>
);
