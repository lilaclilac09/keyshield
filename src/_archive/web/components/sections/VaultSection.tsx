import React from 'react';
import { Plus, Key } from 'lucide-react';
import { VaultItem } from '../../types';
import { VaultItemCard } from '../VaultItemCard';
import { StatCard } from '../ui/StatCard';

interface Props {
  items: VaultItem[];
  total: number;
  expiringSoon: number;
  recentlyUsed: number;
  searchQuery: string;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onDecrypt: (id: string) => Promise<string>;
}

export const VaultSection: React.FC<Props> = ({ items, total, expiringSoon, recentlyUsed, searchQuery, onAdd, onDelete, onDecrypt }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <StatCard label="Total secrets" value={total} hint="encrypted with AES-256-GCM" />
      <StatCard label="Used this week" value={recentlyUsed} hint="across agents and apps" />
      <StatCard
        label="Expiring soon"
        value={<span className={expiringSoon > 0 ? 'text-amber-300' : 'text-white'}>{expiringSoon}</span>}
        hint="within 14 days"
      />
    </div>

    {items.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-[#1c2238] py-24 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-xl bg-[#0e1430] border border-[#1c2550] flex items-center justify-center mb-4">
          <Key size={20} className="text-[#5b8cff]" strokeWidth={1.75} />
        </div>
        <p className="text-[14px] text-zinc-300 font-medium">Your vault is empty</p>
        <p className="text-[12px] text-zinc-500 mt-1 mb-5">
          {searchQuery ? 'No secrets match your search.' : 'Add your first encrypted secret to get started.'}
        </p>
        {!searchQuery && (
          <button
            onClick={onAdd}
            className="h-9 px-4 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] text-white text-[13px] font-medium inline-flex items-center gap-2 transition-colors"
          >
            <Plus size={14} /> Add a secret
          </button>
        )}
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map(item => (
          <VaultItemCard key={item.id} item={item} onDelete={onDelete} onDecrypt={onDecrypt} />
        ))}
      </div>
    )}
  </div>
);
