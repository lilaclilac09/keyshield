import React, { useState, useEffect } from 'react';
import { Home, Key, Activity, Bot, Share2, Users, Settings, Terminal, BookOpen, ShieldCheck, FileText } from 'lucide-react';
import { VaultItem } from './types';
import { AuthScreen } from './components/AuthScreen';
import { AddKeyModal } from './components/AddKeyModal';
import { SolanaProvider } from './components/SolanaProvider';
import { useWallet } from '@solana/wallet-adapter-react';
import { useVaults } from './hooks/useVaults';
import { getWalletAddress, apiFetch, clearAuth, notifyAuthChanged, isAuthenticated as hasStoredToken } from './lib/auth';
import { syncExtensionVaultKey } from './lib/vault-key';
import { Sidebar } from './components/ui/Sidebar';
import { Header } from './components/ui/Header';
import { SearchOverlay } from './components/ui/SearchOverlay';
import { BetaBanner } from './components/BetaBanner';
import { HealthBadge } from './components/HealthBadge';
import { HomeSection } from './components/sections/HomeSection';
import { VaultSection } from './components/sections/VaultSection';
import { ActivitySection } from './components/sections/ActivitySection';
import { fetchKeychainHome, type KeychainHome } from './lib/keychain';
import { AgentsSection } from './components/sections/AgentsSection';
import { EphemeralWalletsSection } from './components/sections/EphemeralWalletsSection';
import { SharingSection } from './components/sections/SharingSection';
import { SessionsSection } from './components/sections/SessionsSection';
import { SettingsSection } from './components/sections/SettingsSection';
import { DeveloperSection } from './components/sections/DeveloperSection';
import { DocsSection } from './components/sections/DocsSection';
import { ReportPage } from './components/ReportPage';
import { X402TrustManager } from './components/X402TrustManager';

type Section = 'home' | 'vault' | 'activity' | 'agents' | 'sharing' | 'sessions' | 'settings' | 'developer' | 'docs' | 'reports' | 'trust';

const NAV: { id: Section; label: string; icon: React.ReactNode; group: 'focus' | 'more' }[] = [
  { id: 'home', label: 'Home', icon: <Home size={16} />, group: 'focus' },
  { id: 'vault', label: 'Vault', icon: <Key size={16} />, group: 'focus' },
  { id: 'activity', label: 'Payments', icon: <Activity size={16} />, group: 'focus' },
  { id: 'developer', label: 'Developer', icon: <Terminal size={16} />, group: 'focus' },
  { id: 'agents', label: 'Agents', icon: <Bot size={14} />, group: 'more' },
  { id: 'sharing', label: 'Sharing', icon: <Share2 size={14} />, group: 'more' },
  { id: 'sessions', label: 'Sessions', icon: <Users size={14} />, group: 'more' },
  { id: 'settings', label: 'Settings', icon: <Settings size={14} />, group: 'more' },
  { id: 'docs', label: 'Docs', icon: <BookOpen size={14} />, group: 'more' },
  { id: 'reports', label: 'Reports', icon: <FileText size={14} />, group: 'more' },
  { id: 'trust', label: 'X402 Trust', icon: <ShieldCheck size={14} />, group: 'more' },
];

const SECTION_CONFIG: Record<Section, { title: string; subtitle: string }> = {
  home: { title: 'Home', subtitle: 'Balance, stored APIs, connection' },
  vault: { title: 'Vault Management', subtitle: 'Encrypted secrets — AES-256-GCM at rest' },
  activity: { title: 'Activity & Billing', subtitle: 'Proxy calls, usage metrics, and balance' },
  agents: { title: 'Agent Registry', subtitle: 'ed25519 agent identities and embedded wallets' },
  sharing: { title: 'Key Sharing', subtitle: 'Re-encrypted access for authorized recipients' },
  sessions: { title: 'Sessions', subtitle: 'Active auth sessions across devices' },
  settings: { title: 'Settings', subtitle: 'Account, security, and preferences' },
  developer: { title: 'Developer', subtitle: 'API tokens, SDK snippets, and endpoint reference' },
  docs: { title: 'Documentation', subtitle: 'Architecture, integration guides, and specs' },
  reports: { title: 'Reports', subtitle: 'Vault audit log — detections, autofills, and saved keys' },
  trust: { title: 'X402 Trust', subtitle: 'Trusted domains for x402 micropayment auto-pay' },
};

const MainContent: React.FC = () => {
  const { disconnect, publicKey } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => hasStoredToken());
  const [section, setSection] = useState<Section>(() => (
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ks_landing') === 'activity-mpp'
      ? 'activity'
      : 'home'
  ));
  const [home, setHome] = useState<KeychainHome | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeMs, setHomeMs] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [prefilledData, setPrefilledData] = useState<Partial<VaultItem> | undefined>(undefined);

  const { items, allItems, addItem, deleteItem, decryptItem, unlocked, unlock, loading: vaultLoading, error: vaultError, refresh } = useVaults(searchQuery, 'All Items');

  useEffect(() => {
    if (!isAuthenticated) return;
    syncExtensionVaultKey();
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'add') return;
    const domain = params.get('domain') || '';
    const upstream = params.get('upstream') || '';
    setPrefilledData({ name: params.get('name') || '', value: params.get('value') || '', domain: upstream ? ({ openrouter: 'openrouter.ai', openai: 'openai.com', anthropic: 'anthropic.com', groq: 'groq.com', mistral: 'mistral.ai', cohere: 'cohere.ai', helius: 'helius.dev', '0x': '0x.org', alchemy: 'alchemy.com' } as Record<string, string>)[upstream] || domain : domain, notes: domain ? `Detected by extension on ${domain}` : 'Detected via extension' });
    setIsAddModalOpen(true);
    window.history.replaceState({}, '', window.location.pathname);
  }, [isAuthenticated]);

  useEffect(() => {
    const onNav = (e: Event) => { const detail = (e as CustomEvent<Section>).detail; if (detail) setSection(detail); };
    window.addEventListener('ks-nav', onNav as EventListener);
    return () => window.removeEventListener('ks-nav', onNav as EventListener);
  }, []);

  const refreshHome = React.useCallback(() => {
    if (!isAuthenticated) return;
    const addr = publicKey?.toBase58() ?? getWalletAddress() ?? '';
    setHomeLoading(true);
    const t0 = performance.now();
    void fetchKeychainHome(addr)
      .then((snap) => { setHome(snap); setHomeError(null); setHomeMs(performance.now() - t0); })
      .catch((err) => { setHomeError(err instanceof Error ? err.message : 'home failed'); setHomeMs(performance.now() - t0); })
      .finally(() => setHomeLoading(false));
  }, [isAuthenticated, publicKey]);

  useEffect(() => {
    refreshHome();
  }, [refreshHome]);

  const handleLogout = async () => { try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {} try { await disconnect(); } catch {} clearAuth(); notifyAuthChanged(); setIsAuthenticated(false); };

  if (!isAuthenticated) {
    return (
      <AuthScreen
        onAuthenticated={() => {
          if (sessionStorage.getItem('ks_landing') === 'activity-mpp') {
            setSection('activity');
          } else {
            setSection('home');
          }
          setIsAuthenticated(true);
        }}
      />
    );
  }

  const fullAddr = publicKey?.toBase58() ?? getWalletAddress() ?? '';
  const config = SECTION_CONFIG[section];

  return (
    <div className="h-screen bg-[#0b1226] text-white flex flex-col" style={{ fontFamily: "'Montserrat', 'Inter', sans-serif" }}>
      <BetaBanner />
      {isSearchOpen && <SearchOverlay query={searchQuery} onChange={setSearchQuery} onClose={() => { setIsSearchOpen(false); setSearchQuery(''); }} />}
      <AddKeyModal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); setPrefilledData(undefined); }} onSave={async (data) => { await addItem(data); refreshHome(); }} initialData={prefilledData} />
      <div className="flex flex-1 min-h-0">
        <Sidebar items={NAV} active={section} onNavigate={(id: string) => setSection(id as Section)} walletAddress={fullAddr} connected={!!fullAddr} sol={home?.wallet.sol} usdc={home?.wallet.usdc} onCopyAddress={() => navigator.clipboard.writeText(fullAddr)} onLogout={handleLogout} />
        <main className="flex-1 min-w-0 flex flex-col bg-[#0b1226]">
          <Header title={config.title} subtitle={config.subtitle} onSearch={() => setIsSearchOpen(true)} onAdd={section === 'vault' ? () => setIsAddModalOpen(true) : undefined} searchActive={!!searchQuery} actions={<HealthBadge />} />
          <div className="flex-1 overflow-auto px-6 py-6">
            <div className="max-w-5xl mx-auto">
              {section === 'home' && (
                <HomeSection
                  home={home}
                  loading={homeLoading}
                  error={homeError}
                  homeMs={homeMs}
                  walletConnected={!!fullAddr}
                  onRefresh={() => { refreshHome(); refresh(); }}
                  onUnlock={unlock}
                  unlocking={vaultLoading}
                  onGo={(id) => setSection(id as Section)}
                />
              )}
              {section === 'vault' && <VaultSection items={items} total={allItems.length} searchQuery={searchQuery} onAdd={() => setIsAddModalOpen(true)} onDelete={deleteItem} onDecrypt={decryptItem} unlocked={unlocked} unlocking={vaultLoading} unlockError={vaultError} onUnlock={unlock} onStored={() => { refreshHome(); refresh(); }} />}
              {section === 'activity' && <ActivitySection />}
              {section === 'agents' && (<><AgentsSection /><EphemeralWalletsSection /></>)}
              {section === 'sharing' && <SharingSection addr={fullAddr} />}
              {section === 'sessions' && <SessionsSection onLogout={handleLogout} />}
              {section === 'settings' && <SettingsSection addr={fullAddr} />}
              {section === 'developer' && <DeveloperSection vaultUpstreams={(home?.apis ?? []).map((row) => row.upstream)} />}
              {section === 'docs' && <DocsSection />}
              {section === 'reports' && <ReportPage />}
              {section === 'trust' && <X402TrustManager />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

const App: React.FC = () => (<SolanaProvider><MainContent /></SolanaProvider>);
export default App;
