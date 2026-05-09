import { useState, useEffect, useCallback } from 'react';
import { Key, Activity, Bot, Share2, Users, Settings, Terminal, BookOpen, Search, Plus } from 'lucide-react';
import { SolanaProvider } from './components/SolanaProvider';
import { useWallet } from '@solana/wallet-adapter-react';
import type { VaultItem } from './types';
import { addAuth, clearAuth, getAuth, notifyAuthChanged, isAuthenticated as hasStoredToken } from './lib/auth';
import { apiFetch } from './lib/api';
import { Sidebar } from './components/ui/Sidebar';
import { Header } from './components/ui/Header';
import { SearchOverlay } from './components/ui/SearchOverlay';
import { BetaBanner } from './components/BetaBanner';
import { HealthBadge } from './components/HealthBadge';
import { VaultSection } from './components/sections/VaultSection';
import { ActivitySection } from './components/sections/ActivitySection';
import { AgentsSection } from './components/sections/AgentsSection';
import { EphemeralWalletsSection } from './components/sections/EphemeralWalletsSection';
import { SharingSection } from './components/sections/SharingSection';
import { SessionsSection } from './components/sections/SessionsSection';
import { SettingsSection } from './components/sections/SettingsSection';
import { DeveloperSection } from './components/sections/DeveloperSection';
import { DocsSection } from './components/sections/DocsSection';
import { AddKeyModal } from './components/AddKeyModal';
import { RevealField } from './components/ui/RevealField';
import { useVaultList, useVaultDelete, useVaultAdd } from './hooks/useVaults';

type Section = 'vault' | 'activity' | 'agents' | 'sharing' | 'sessions' | 'settings' | 'developer' | 'docs';

const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'vault', label: 'Vault', icon: <Key size={14} /> },
  { id: 'activity', label: 'Activity', icon: <Activity size={14} /> },
  { id: 'agents', label: 'Agents', icon: <Bot size={14} /> },
  { id: 'sharing', label: 'Sharing', icon: <Share2 size={14} /> },
  { id: 'sessions', label: 'Sessions', icon: <Users size={14} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={14} /> },
  { id: 'developer', label: 'Developer', icon: <Terminal size={14} /> },
  { id: 'docs', label: 'Docs', icon: <BookOpen size={14} /> },
];

const SECTION_CONFIG: Record<Section, { title: string; subtitle: string }> = {
  vault: { title: 'Vault Management', subtitle: 'Encrypted secrets \u2014 AES-256-GCM at rest' },
  activity: { title: 'Activity & Billing', subtitle: 'Proxy calls, usage metrics, and balance' },
  agents: { title: 'Agent Registry', subtitle: 'ed25519 agent identities and embedded wallets' },
  sharing: { title: 'Key Sharing', subtitle: 'Re-encrypted access for authorized recipients' },
  sessions: { title: 'Sessions', subtitle: 'Active auth sessions across devices' },
  settings: { title: 'Settings', subtitle: 'Account, security, and preferences' },
  developer: { title: 'Developer', subtitle: 'API tokens, SDK snippets, and endpoint reference' },
  docs: { title: 'Documentation', subtitle: 'Architecture, integration guides, and specs' },
};

interface PrefillData {
  name: string;
  value: string;
  domain: string;
  notes: string;
}

const MAIN: React.FC = () => {
  const { disconnect, publicKey } = useWallet();
  const [section, setSection] = useState<Section>('vault');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [prefilledData, setPrefilledData] = useState<PrefillData | null>(null);

  // Auth check
  useEffect(() => {
    setIsAuthenticated(hasStoredToken());
  }, []);

  // TanStack Query-powered vault list
  const { data: items = [], isLoading } = useVaultList(searchQuery, 'All Items');
  const deleteMutation = useVaultDelete();
  const addMutation = useVaultAdd();

  // Prefill from URL params (e.g. when opening via extension)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'add') return;
    const domain = params.get('domain') || '';
    const upstream = params.get('upstream') || '';
    setPrefilledData({
      name: params.get('name') || '',
      value: params.get('value') || '',
      domain: upstream ? ({ openai: 'openai.com', anthropic: 'anthropic.com', groq: 'groq.com', mistral: 'mistral.ai', cohere: 'cohere.ai', helius: 'helius.dev', '0x': '0x.org', alchemy: 'alchemy.com' } as Record<string, string>)[upstream] || domain : domain,
      notes: domain ? `Detected by extension on ${domain}` : 'Detected via extension',
    });
    setIsAddModalOpen(true);
    window.history.replaceState({}, '', window.location.pathname);
  }, [isAuthenticated]);

  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<Section>).detail;
      if (detail) setSection(detail);
    };
    window.addEventListener('ks-nav', onNav as EventListener);
    return () => window.removeEventListener('ks-nav', onNav as EventListener);
  }, []);

  // React 19: useCallback with stable deps
  const handleLogout = useCallback(async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    try { await disconnect(); } catch {}
    clearAuth();
    notifyAuthChanged();
  }, [disconnect]);

  const handleAddItem = useCallback(async (item: Partial<VaultItem> & { upstream?: string; rawKey?: string }) => {
    await addMutation.mutateAsync(item as any);
    setIsAddModalOpen(false);
  }, [addMutation]);

  const handleDeleteItem = useCallback(async (id: string) => {
    await deleteMutation.mutateAsync(id);
  }, [deleteMutation]);

  const handleDecrypt = useCallback(async (id: string): Promise<string> => {
    const res = await apiFetch(`/api/vault/${id}/decrypt`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to decrypt');
    const data = await res.json() as { value: string };
    return data.value;
  }, []);

  const fullAddr = publicKey?.toBase58() ?? getAuth()?.walletAddress ?? '';
  const config = SECTION_CONFIG[section];

  // Auth check loading
  if (isAuthenticated === null) {
    return <div className="h-screen bg-black text-white flex items-center justify-center">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => setSection('vault')} />;
  }

  return (
    <div className="h-screen bg-black text-white flex flex-col" style={{ fontFamily: "'Montserrat', 'Inter', sans-serif" }}>
      <BetaBanner />
      {isSearchOpen && (
        <SearchOverlay
          query={searchQuery}
          onChange={setSearchQuery}
          onClose={() => { setIsSearchOpen(false); setSearchQuery(''); }}
        />
      )}
      <AddKeyModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); }}
        onSave={handleAddItem}
        initialData={prefilledData ?? undefined}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          items={NAV}
          active={section}
          onNavigate={(id: string) => setSection(id as Section)}
          walletAddress={fullAddr}
          connected={!!fullAddr}
          onCopyAddress={() => navigator.clipboard.writeText(fullAddr)}
          onLogout={handleLogout}
        />
        <main className="flex-1 min-w-0 flex flex-col bg-black">
          <Header
            title={config.title}
            subtitle={config.subtitle}
            onSearch={() => setIsSearchOpen(true)}
            onAdd={section === 'vault' ? () => setIsAddModalOpen(true) : undefined}
            searchActive={!!searchQuery}
            actions={<HealthBadge />}
          />
          <div className="flex-1 overflow-auto px-6 py-6">
            <div className="max-w-5xl mx-auto">
              {section === 'vault' && (
                <VaultSection
                  items={items}
                  total={items.length}
                  searchQuery={searchQuery}
                  onAdd={() => setIsAddModalOpen(true)}
                  onDelete={handleDeleteItem}
                  onDecrypt={handleDecrypt}
                  isLoading={isLoading}
                />
              )}
              {section === 'activity' && <ActivitySection />}
              {section === 'agents' && (<><AgentsSection /><EphemeralWalletsSection /></>)}
              {section === 'sharing' && <SharingSection addr={fullAddr} />}
              {section === 'sessions' && <SessionsSection onLogout={handleLogout} />}
              {section === 'settings' && <SettingsSection addr={fullAddr} />}
              {section === 'developer' && <DeveloperSection />}
              {section === 'docs' && <DocsSection />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

// Auth screen component — extracted for clean separation
const AuthScreen: React.FC<{ onAuthenticated: () => void }> = ({ onAuthenticated }) => {
  const { connect, connecting } = useWallet();

  return (
    <div className="h-screen bg-black text-white flex flex-col items-center justify-center">
      <div className="text-center space-y-8">
        <h1 className="text-4xl font-bold tracking-tight">KeyShield</h1>
        <p className="text-muted-foreground text-lg">Connect your wallet to sign in</p>
        <button
          onClick={() => connect()}
          disabled={connecting}
          className="px-8 py-3 bg-white text-black rounded-md font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => <SolanaProvider><MAIN /></SolanaProvider>;
export default App;
