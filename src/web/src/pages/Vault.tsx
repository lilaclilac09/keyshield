import { useState } from 'react';
import { Key, Plus, Search } from 'lucide-react';
import { useVault } from '@keyshield/shared/hooks/use-vault';
import { StatCard } from '../components/ui/StatCard';
import { VaultItemCard } from '../components/VaultItemCard';
import { AddKeyModal } from '../components/AddKeyModal';
import { OcrScanner } from '../components/OcrScanner';

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'api_key', label: 'Keys' },
  { value: 'password', label: 'Passwords' },
  { value: 'note', label: 'Notes' },
  { value: 'env', label: 'Env' },
  { value: 'ssh_key', label: 'SSH' },
];

export default function Vault() {
  const { items, isLoading, refetch } = useVault();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);

  const filtered = items.filter(item => {
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.upstream?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || item.type === filter;
    return matchesSearch && matchesFilter;
  });

  const total = items.length;
  const expiringSoon = items.filter(i => {
    if (!i.expires_at) return false;
    const days = (new Date(i.expires_at).getTime() - Date.now()) / 86400000;
    return days <= 14 && days > 0;
  }).length;
  const recentlyUsed = items.filter(i => {
    if (!i.updated_at) return false;
    return (Date.now() - new Date(i.updated_at).getTime()) / 86400000 <= 7;
  }).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Total Secrets" value={total} hint="encrypted with AES-256-GCM" />
        <StatCard label="Used This Week" value={recentlyUsed} hint="across agents and apps" />
        <StatCard
          label="Expiring Soon"
          value={
            <span className={expiringSoon > 0 ? 'text-amber-500' : 'text-white'}>{expiringSoon}</span>
          }
          hint="within 14 days"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vault…"
            className="w-full h-9 pl-9 pr-3 rounded-[3px] bg-[#0a0a0a] border border-zinc-800/50 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
          />
        </div>
        <div className="flex rounded-[3px] border border-zinc-800/50 bg-[#0a0a0a] p-0.5">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 h-8 rounded-[2px] text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                filter === f.value
                  ? 'bg-white text-black'
                  : 'text-zinc-500 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOcrOpen(true)}
          className="h-9 px-3 rounded-[3px] border border-zinc-800/50 bg-[#0a0a0a] text-[12px] uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          Scan
        </button>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="h-9 px-4 rounded-[3px] bg-white hover:bg-zinc-200 text-black text-[13px] font-semibold uppercase tracking-wider inline-flex items-center gap-2 transition-colors"
        >
          <Plus size={14} /> Add Secret
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-[3px] border border-zinc-800/50 bg-[#0a0a0a] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[3px] border border-dashed border-zinc-800/50 py-24 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-[3px] bg-[#0a0a0a] border border-zinc-800/50 flex items-center justify-center mb-4">
            <Key size={20} className="text-white" strokeWidth={1.75} />
          </div>
          <p className="text-[14px] text-zinc-300 font-medium">
            {search ? 'No secrets match your search' : 'Your vault is empty'}
          </p>
          <p className="text-[12px] text-zinc-500 mt-1 mb-5">
            {search ? '' : 'Add your first encrypted secret to get started'}
          </p>
          {!search && (
            <button
              onClick={() => setAddOpen(true)}
              className="h-9 px-4 rounded-[2px] bg-white hover:bg-zinc-200 text-black text-[13px] font-semibold uppercase tracking-wider inline-flex items-center gap-2 transition-colors"
            >
              <Plus size={14} /> Add Secret
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(item => (
            <VaultItemCard
              key={item.id}
              item={item}
              onReveal={() => {}}
              onCopy={() => {}}
              onDelete={() => refetch()}
            />
          ))}
        </div>
      )}

      <AddKeyModal open={addOpen} onOpenChange={setAddOpen} />
      <OcrScanner open={ocrOpen} onOpenChange={setOcrOpen} />
    </div>
  );
}
