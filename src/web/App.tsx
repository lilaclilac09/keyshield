import React, { useState, useEffect } from 'react';
import { Key, Activity, Bot, Share2, Users, Settings, Terminal, BookOpen, ShieldCheck, FileText } from 'lucide-react';
import { VaultItem } from './types';
import { AuthScreen } from './components/AuthScreen';
import { AddKeyModal } from './components/AddKeyModal';
import { SolanaProvider } from './components/SolanaProvider';
import { useWallet } from '@solana/wallet-adapter-react';
import { useVaults } from './hooks/useVaults';
import { getWalletAddress, apiFetch, clearAuth, notifyAuthChanged, isAuthenticated as hasStoredToken } from './lib/auth';
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
import { DeviceVaultSection } from './components/sections/DeviceVaultSection';
import { RevealField } from './components/ui/RevealField';
import { ReportPage } from './components/ReportPage';
import { X402TrustManager } from './components/X402TrustManager';

type Section = 'vault' | 'device-vault' | 'activity' | 'agents' | 'sharing' | 'sessions' | 'settings' | 'developer' | 'docs' | 'reports' | 'trust';

const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'vault', label: 'Vault', icon: <Key size={14} /> },
  { id: 'device-vault', label: 'Device Vault', icon: <ShieldCheck size={14} /> },
  { id: 'activity', label: 'Activity', icon: <Activity size={14} /> },
  { id: 'agents', label: 'Agents', icon: <Bot size={14} /> },
  { id: 'sharing', label: 'Sharing', icon: <Share2 size={14} /> },
  { id: 'sessions', label: 'Sessions', icon: <Users size={14} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={14} /> },
  { id: 'developer', label: 'Developer', icon: <Terminal size={14} /> },
  { id: 'docs', label: 'Docs', icon: <BookOpen size={14} /> },
  { id: 'reports', label: 'Reports', icon: <FileText size={14} /> },
  { id: 'trust', label: 'X402 Trust', icon: <ShieldCheck size={14} /> },
];

const SECTION_CONFIG: Record<Section, { title: string; subtitle: string }> = {
  vault: { title: 'Vault Management', subtitle: 'Encrypted secrets \u2014 AES-256-GCM at rest' },
  'device-vault': { title: 'Device Vault', subtitle: 'Zero-knowledge \u2014 encrypted on this device, server only sees ciphertext' },
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
  const [section, setSection] = useState<Section>('vault');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [prefilledData, setPrefilledData] = useState<Partial<VaultItem> | undefined>(undefined);

  const { items, allItems, addItem, deleteItem, decryptItem } = useVaults(searchQuery, 'All Items');

  useEffect(() => {
    if (!isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'add') return;
    const domain = params.get('domain') || '';
    const upstream = params.get('upstream') || '';
    setPrefilledData({ name: params.get('name') || '', value: params.get('value') || '', domain: upstream ? ({ openai: 'openai.com', anthropic: 'anthropic.com', groq: 'groq.com', mistral: 'mistral.ai', cohere: 'cohere.ai', helius: 'helius.dev', '0x': '0x.org', alchemy: 'alchemy.com' } as Record<string, string>)[upstream] || domain : domain, notes: domain ? `Detected by extension on ${domain}` : 'Detected via extension' });
    setIsAddModalOpen(true);
    window.history.replaceState({}, '', window.location.pathname);
  }, [isAuthenticated]);

  useEffect(() => {
    const onNav = (e: Event) => { const detail = (e as CustomEvent<Section>).detail; if (detail) setSection(detail); };
    window.addEventListener('ks-nav', onNav as EventListener);
    return () => window.removeEventListener('ks-nav', onNav as EventListener);
  }, []);

  const handleLogout = async () => { try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {} try { await disconnect(); } catch {} clearAuth(); notifyAuthChanged(); setIsAuthenticated(false); };

  if (!isAuthenticated) return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />;

  const fullAddr = publicKey?.toBase58() ?? getWalletAddress() ?? '';
  const config = SECTION_CONFIG[section];

  return (
    <div className="h-screen bg-[#0b1226] text-white flex flex-col" style={{ fontFamily: "'Montserrat', 'Inter', sans-serif" }}>
      <BetaBanner />
      {isSearchOpen && <SearchOverlay query={searchQuery} onChange={setSearchQuery} onClose={() => { setIsSearchOpen(false); setSearchQuery(''); }} />}
      <AddKeyModal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); setPrefilledData(undefined); }} onSave={addItem} initialData={prefilledData} />
      <div className="flex flex-1 min-h-0">
        <Sidebar items={NAV} active={section} onNavigate={(id: string) => setSection(id as Section)} walletAddress={fullAddr} connected={!!fullAddr} onCopyAddress={() => navigator.clipboard.writeText(fullAddr)} onLogout={handleLogout} />
        <main className="flex-1 min-w-0 flex flex-col bg-[#0b1226]">
          <Header title={config.title} subtitle={config.subtitle} onSearch={() => setIsSearchOpen(true)} onAdd={section === 'vault' ? () => setIsAddModalOpen(true) : undefined} searchActive={!!searchQuery} actions={<HealthBadge />} />
          <div className="flex-1 overflow-auto px-6 py-6">
            <div className="max-w-5xl mx-auto">
              {section === 'vault' && <VaultSection items={items} total={allItems.length} searchQuery={searchQuery} onAdd={() => setIsAddModalOpen(true)} onDelete={deleteItem} onDecrypt={decryptItem} />}
              {section === 'device-vault' && <DeviceVaultSection />}
              {section === 'activity' && <ActivitySection />}
              {section === 'agents' && (<><AgentsSection /><EphemeralWalletsSection /></>)}
              {section === 'sharing' && <SharingSection addr={fullAddr} />}
              {section === 'sessions' && <SessionsSection onLogout={handleLogout} />}
              {section === 'settings' && <SettingsSection addr={fullAddr} />}
              {section === 'developer' && <DeveloperSection />}
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
