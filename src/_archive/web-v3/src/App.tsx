import React, { useState } from 'react';
import { Key } from 'lucide-react';
import { SolanaProvider } from './components/SolanaProvider';
import { useWallet } from '@solana/wallet-adapter-react';
import type { VaultItem } from './types';
import { clearAuth, getAuth, notifyAuthChanged, isAuthenticated as hasStoredToken } from './lib/auth';
import { apiFetch } from './lib/api';
import { Sidebar } from './components/ui/Sidebar';
import { Header } from './components/ui/Header';
import { SearchOverlay } from './components/ui/SearchOverlay';
import { BetaBanner } from './components/BetaBanner';
import { HealthBadge } from './components/HealthBadge';
import { AuthScreen } from './components/AuthScreen';
import { AddKeyModal } from './components/AddKeyModal';
import { VaultSection } from './features/vault/components/VaultSection';
import { ActivitySection } from './features/vault/components/ActivitySection';
import { AgentsSection } from './features/vault/components/AgentsSection';
import { EphemeralWalletsSection } from './features/vault/components/EphemeralWalletsSection';
import { SharingSection } from './features/vault/components/SharingSection';
import { SessionsSection } from './features/vault/components/SessionsSection';
import { SettingsSection } from './features/vault/components/SettingsSection';
import { DeveloperSection } from './features/vault/components/DeveloperSection';
import { DocsSection } from './features/vault/components/DocsSection';
import { useVaultList, useVaultDelete, useVaultAdd } from './hooks/useVaults';

type Section = 'vault' | 'activity' | 'agents' | 'sharing' | 'sessions' | 'settings' | 'developer' | 'docs';

const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'vault', label: 'Vault', icon: <Key size={14} /> },
  { id: 'activity', label: 'Activity', icon: <Key size={14} /> },
  { id: 'agents', label: 'Agents', icon: <Key size={14} /> },
  { id: 'sharing', label: 'Sharing', icon: <Key size={14} /> },
  { id: 'sessions', label: 'Sessions', icon: <Key size={14} /> },
  { id: 'settings', label: 'Settings', icon: <Key size={14} /> },
  { id: 'developer', label: 'Developer', icon: <Key size={14} /> },
  { id: 'docs', label: 'Docs', icon: <Key size={14} /> },
];

const SECTION_CONFIG: Record<Section, { title: string; subtitle: string }> = {
  vault:     { title: 'Vault Management', subtitle: 'Encrypted secrets — AES-256-GCM at rest' },
  activity:  { title: 'Activity & Billing', subtitle: 'Proxy calls, usage metrics, and balance' },
  agents:    { title: 'Agent Registry', subtitle: 'ed25519 agent identities and embedded wallets' },
  sharing:   { title: 'Key Sharing', subtitle: 'Re-encrypted access for authorized recipients' },
  sessions:  { title: 'Sessions', subtitle: 'Active auth sessions across devices' },
  settings:  { title: 'Settings', subtitle: 'Account, security, and preferences' },
  developer: { title: 'Developer', subtitle: 'API tokens, SDK snippets, and endpoint reference' },
  docs:      { title: 'Documentation', subtitle: 'Architecture, integration guides, and specs' },
};

interface PrefillData { name: string; value: string; domain: string; notes: string; }

const MainContent: React.FC = () => {
  const { disconnect, publicKey } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => hasStoredToken());
  const [section, setSection] = useState<Section>('vault');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [prefilledData, setPrefilledData] = useState<PrefillData | undefined>(undefined);

  console.log('[MainContent] rendered, isAuthenticated:', isAuthenticated);

  // useVaultList returns { data: VaultItem[], isLoading, ... } from react-query
  const vaultQuery = useVaultList(searchQuery, 'All Items');
  const items = (vaultQuery as any).data ?? [];
  const isLoading = (vaultQuery as any).isLoading;
  const deleteMutation = useVaultDelete();
  const addMutation = useVaultAdd();

  useEffect(() => {
    console.log('[App] isAuthenticated:', isAuthenticated, 'token:', localStorage.getItem('ks_token'));
  }, [isAuthenticated]);

  // Handle ?action=add deep-link from browser extension
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'add') return;
    const domain = params.get('domain') || '';
    const upstream = params.get('upstream') || '';
    setPrefilledData({
      name: params.get('name') || '',
      value: params.get('value') || '',
      domain: upstream
        ? ({
            openai: 'openai.com', anthropic: 'anthropic.com', groq: 'groq.com',
            mistral: 'mistral.ai', cohere: 'cohere.ai', helius: 'helius.dev',
            '0x': '0x.org', alchemy: 'alchemy.com',
          } as Record<string, string>)[upstream] || domain
        : domain,
      notes: domain ? `Detected by extension on ${domain}` : 'Detected via extension',
    });
    setIsAddModalOpen(true);
    window.history.replaceState({}, '', window.location.pathname);
  }, [isAuthenticated]);

  // Cross-component nav
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<Section>).detail;
      if (detail) setSection(detail);
    };
    window.addEventListener('ks-nav', onNav as EventListener);
    return () => window.removeEventListener('ks-nav', onNav as EventListener);
  }, []);

  const handleLogout = useCallback(async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    try { await disconnect(); } catch {}
    clearAuth();
    notifyAuthChanged();
    setIsAuthenticated(false);
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

  if (!isAuthenticated) {
    console.log('[App] Showing AuthScreen');
    return (
      <AuthScreen onAuthenticated={() => { console.log('[App] onAuthenticated called!'); setIsAuthenticated(true); }} />
    );
  }

  console.log('[App] Showing main UI, section:', section);
  return (
    <div className="h-screen w-full bg-black text-white flex flex-col" style={{ fontFamily: "'Montserrat', 'Inter', sans-serif" }}>
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
        onClose={() => { setIsAddModalOpen(false); setPrefilledData(undefined); }}
        onSave={handleAddItem}
        initialData={prefilledData}
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
              {section === 'agents' && <>
                <AgentsSection />
                <EphemeralWalletsSection />
              </>}
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

const App: React.FC = () => {
  console.log('[App] Rendering (wrapped in SolanaProvider)');
  return (
    <SolanaProvider>
      <MainContent />
    </SolanaProvider>
  );
};

export default App;
