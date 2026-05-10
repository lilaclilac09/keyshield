import { useState } from 'react';
import { Key, Plus, Search, Filter } from 'lucide-react';
import { Button, Input, Tabs, TabsList, TabsTrigger, Badge, Skeleton } from '@keyshield/ui';
import { StatCard } from '../components/ui/StatCard';
import { useVault } from '@keyshield/shared/hooks/use-vault';
import { inferVaultTypeIcon, inferVaultItemType } from '@keyshield/shared/types';
import { relTime } from '@keyshield/shared/lib/time';
import { VaultItemCard } from '../components/VaultItemCard';
import { AddKeyModal } from '../components/AddKeyModal';
import { OcrScanner } from '../components/OcrScanner';
import { GuillochePattern } from '../components/ui/Guilloche';

export default function Vault() {
  const { items, isLoading, refetch } = useVault();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);

  const filtered = items.filter(item => {
    const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || (item.upstream?.toLowerCase().includes(search.toLowerCase()));
    const matchesFilter = filter === 'all' || item.type === filter;
    return matchesSearch && matchesFilter;
  });

  const total = items.length;
  const expiringSoon = items.filter(i => {
    if (!i.expires_at) return false;
    const days = (new Date(i.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days <= 14 && days > 0;
  }).length;
  const recentlyUsed = items.filter(i => {
    if (!i.updated_at) return false;
    return (Date.now() - new Date(i.updated_at).getTime()) / (1000 * 60 * 60 * 24) <= 7;
  }).length;

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div className="relative">
      <div className="page-header">
        <div>
          <h1 style={{ color: '#f8f8f8' }}>Vault</h1>
          <p className="page-header-subtitle">{total} items stored · AES-256-GCM encrypted</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOcrOpen(true)}>
            <Key className="h-4 w-4 mr-1.5" /> OCR Scan
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Secret
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="Total secrets" value={total} hint="encrypted with AES-256-GCM" />
        <StatCard label="Used this week" value={recentlyUsed} hint="across agents and apps" />
        <StatCard
          label="Expiring soon"
          value={<span className={expiringSoon > 0 ? 'text-amber-300' : 'text-white'}>{expiringSoon}</span>}
          hint="within 14 days"
        />
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#f8f8f8' }} />
          <Input className="pl-9 bg-[#0a0a0a] border-[#141414] text-white" placeholder="Search vault..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="api_key">Keys</TabsTrigger>
            <TabsTrigger value="password">Passwords</TabsTrigger>
            <TabsTrigger value="note">Notes</TabsTrigger>
            <TabsTrigger value="env">Env</TabsTrigger>
            <TabsTrigger value="ssh_key">SSH</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[#141414] rounded-2xl">
          <div className="w-12 h-12 rounded-xl bg-[#0a0a0a] border border-[#141414] flex items-center justify-center mb-4">
            <Key size={20} style={{ color: '#f8f8f8' }} strokeWidth={1.75} />
          </div>
          <h3 className="text-lg font-medium" style={{ color: '#f8f8f8' }}>
            {search ? 'No matching secrets' : 'Your vault is empty'}
          </h3>
          <p className="mt-1 text-sm" style={{ color: '#f8f8f8' }}>
            {search ? 'Try adjusting your search or filter.' : 'Add your first encrypted secret to get started.'}
          </p>
          {!search && (
            <Button className="mt-4" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add a secret
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map(item => (
            <VaultItemCard key={item.id} item={item} onReveal={() => {}} onCopy={() => {}} onDelete={() => refetch()} />
          ))}
        </div>
      )}

      <GuillochePattern opacity={0.02} />
      <AddKeyModal open={addOpen} onOpenChange={setAddOpen} />
      <OcrScanner open={ocrOpen} onOpenChange={setOcrOpen} />
    </div>
  );
}
