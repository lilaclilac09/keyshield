import { useState } from 'react';
import { Key, Plus, Search, Filter } from 'lucide-react';
import { Button, Input, Tabs, TabsList, TabsTrigger, Badge, Skeleton } from '@keyshield/ui';
import { useVault } from '@keyshield/shared/hooks/use-vault';
import { inferVaultTypeIcon, inferVaultItemType } from '@keyshield/shared/types';
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

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#707070' }}>Vault</h1>
          <p className="page-header-subtitle">{items.length} items stored · Secure multi-sig custody</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOcrOpen(true)}>
            <Key className="h-4 w-4 mr-1.5" style={{ color: '#808080' }} /> OCR Scan
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" style={{ color: '#808080' }} /> Add Secret
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#505050' }} />
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

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Key className="h-12 w-12 mb-4" style={{ color: '#303030' }} />
          <h3 className="text-lg font-medium" style={{ color: '#707070' }}>No vault items</h3>
          <p className="mt-1" style={{ color: '#505050' }}>Add your first API key, password, or secret</p>
          <Button className="mt-4" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" style={{ color: '#808080' }} /> Add Secret
          </Button>
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
