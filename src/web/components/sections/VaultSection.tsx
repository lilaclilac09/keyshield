import React from 'react';
import { Key, Plus, ShieldCheck, ArrowRight } from 'lucide-react';
import { VaultItem } from '../../types';
import { VaultItemCard } from '../VaultItemCard';
import { StatCard } from '../ui/Card';

interface Props {
  items: VaultItem[]; total: number; searchQuery: string;
  onAdd: () => void; onDelete: (id: string) => void; onDecrypt: (id: string) => Promise<string>;
}

export const VaultSection: React.FC<Props> = ({ items, total, searchQuery, onAdd, onDelete, onDecrypt }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <StatCard label="Total Secrets" value={total} hint="encrypted with AES-256-GCM" />
      <StatCard label="Used This Week" value={items.filter(i => Date.now() - i.lastUsedAt < 86400000 * 7).length} hint="across agents and apps" />
      <StatCard label="Expiring Soon" value={items.filter(i => { if (!i.expiryDate) return false; const d = (new Date(i.expiryDate).getTime() - Date.now()) / 86400000; return d >= 0 && d <= 14; }).length} hint="within 14 days" />
    </div>
    {items.length === 0 ? (
      <div className="rounded-xl border border-dashed border-[#243365]/50 py-16 flex flex-col items-center justify-center text-center px-6">
        <div className="w-12 h-12 rounded-xl bg-[#131c39] border border-[#243365]/50 flex items-center justify-center mb-4">
          <Key size={20} className="text-white" strokeWidth={1.75} />
        </div>
        <p className="text-[14px] text-[#e8ecff] font-medium">{searchQuery ? 'No secrets match your search' : 'Your vault is empty'}</p>
        <p className="text-[12px] text-[#8a96c2] mt-1 mb-5">{searchQuery ? '' : 'Add your first encrypted secret to get started'}</p>
        {!searchQuery && (
          <>
            <button onClick={onAdd} className="h-9 px-4 rounded-lg bg-white hover:bg-zinc-200 text-black text-[13px] font-semibold uppercase tracking-wider inline-flex items-center gap-2 transition-colors">
              <Plus size={14} /> Add Secret
            </button>
            <div className="mt-8 w-full max-w-lg">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={13} className="text-emerald-400" />
                <span className="text-[11px] font-semibold text-[#8a96c2] uppercase tracking-wider">How it works</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-[11px] text-[#8a96c2] flex-wrap">
                <span className="px-2 py-1 rounded bg-[#131c39] border border-[#243365]/50 text-white">Add key here</span>
                <ArrowRight size={11} className="text-[#3e4a72]" />
                <span className="px-2 py-1 rounded bg-[#131c39] border border-[#243365]/50 text-[#a8b3d8]">Encrypted on device</span>
                <ArrowRight size={11} className="text-[#3e4a72]" />
                <span className="px-2 py-1 rounded bg-[#131c39] border border-[#243365]/50 text-[#a8b3d8]">Agent calls /proxy/...</span>
                <ArrowRight size={11} className="text-[#3e4a72]" />
                <span className="px-2 py-1 rounded bg-emerald-950/40 border border-emerald-900/30 text-emerald-400">Key injected per-request</span>
              </div>
              <p className="text-[10px] text-[#5e6a91] mt-2">
                Your agent never sees the raw API key. Keys are decrypted in-memory and forwarded via the proxy.
              </p>
            </div>
          </>
        )}
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map(item => <VaultItemCard key={item.id} item={item} onDelete={onDelete} onDecrypt={onDecrypt} />)}
      </div>
    )}
  </div>
);
