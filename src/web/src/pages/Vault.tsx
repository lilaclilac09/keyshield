import { useState } from 'react';
import { Key, Plus, Search, Filter, Sparkles } from 'lucide-react';
import { Button, Input, Tabs, TabsList, TabsTrigger, Badge, Skeleton } from '@keyshield/ui';
import { StatCard } from '../components/ui/StatCard';
import { useVault } from '@keyshield/shared/hooks/use-vault';
import { relTime } from '@keyshield/shared/lib/time';
import { VaultItemCard } from '../components/VaultItemCard';
import { AddKeyModal } from '../components/AddKeyModal';
import { OcrScanner } from '../components/OcrScanner';

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

  if (isLoading) return (
    <div>
      <div className="stat-card-grid">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl bg-[#111]" />)}</div>
      <div className="grid gap-3 md:grid-cols-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-40 rounded-xl bg-[#111]" />)}</div>
    </div>
  );

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>Vault</h1>
          <p className="page-header-subtitle">Encrypted secrets, keys, and credentials</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOcrOpen(true)} className="text-[#a0a0b0]">
            Scan
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Secret
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-card-grid">
        <StatCard label="Total secrets" value={total} hint="encrypted with AES-256-GCM" />
        <StatCard label="Used this week" value={recentlyUsed} hint="across agents and apps" />
        <StatCard
          label="Expiring soon"
          value={<span className={expiringSoon > 0 ? 'text-[#f59e0b]' : 'text-[#a0a0b0]'}>{expiringSoon}</span>}
          hint="within 14 days"
        />
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#4a4a56' }} />
          <Input
            className="pl-9 bg-[#111114] border-[#1e1e24] text-white placeholder:text-[#4a4a56]"
            placeholder="Search vault\u2026"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
        <div className="empty-state">
          <div className="empty-state-icon">
            <Key size={20} strokeWidth={1.75} />
          </div>
          <h3>{search ? 'No matching secrets' : 'Your vault is empty'}</h3>
          <p>{search ? 'Try adjusting your search or filter.' : 'Add your first encrypted secret to get started.'}</p>
          {!search && (
            <button className="ks-btn-primary" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add a secret
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map(item => (
            <VaultItemCard key={item.id} item={item} onReveal={() => {}} onCopy={() => {}} onDelete={() => refetch()} />
          ))}
        </div>
      )}

      <AddKeyModal open={addOpen} onOpenChange={setAddOpen} />
      <OcrScanner open={ocrOpen} onOpenChange={setOcrOpen} />
    </div>
  );
}
