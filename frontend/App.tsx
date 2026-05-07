import React, { useState, useEffect, useRef } from 'react';
import {
  Search, X, Shield, LogOut, Plus, Key, Activity, Share2, Users,
  Settings as SettingsIcon, Bot, Copy, Check, Terminal, BookOpen,
} from 'lucide-react';
import { VaultItem } from './types';
import { AuthScreen } from './components/AuthScreen';
import { AddKeyModal } from './components/AddKeyModal';
import { SolanaProvider } from './components/SolanaProvider';
import { useWallet } from '@solana/wallet-adapter-react';
import { useVaults } from './hooks/useVaults';
import {
  getWalletAddress,
  apiFetch,
  clearAuth,
  notifyAuthChanged,
  isAuthenticated as hasStoredToken,
} from './lib/auth';

import { VaultSection }     from './components/sections/VaultSection';
import { ActivitySection }  from './components/sections/ActivitySection';
import { AgentsSection }    from './components/sections/AgentsSection';
import { SharingSection }   from './components/sections/SharingSection';
import { SessionsSection }  from './components/sections/SessionsSection';
import { SettingsSection }  from './components/sections/SettingsSection';
import { DeveloperSection } from './components/sections/DeveloperSection';
import { DocsSection }      from './components/sections/DocsSection';
import { BetaBanner }       from './components/BetaBanner';
import { HealthBadge }      from './components/HealthBadge';

type Section = 'vault' | 'activity' | 'agents' | 'sharing' | 'sessions' | 'settings' | 'developer' | 'docs';

const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'vault',     label: 'Vault',     icon: <Key size={16} strokeWidth={1.75} /> },
  { id: 'activity',  label: 'Activity',  icon: <Activity size={16} strokeWidth={1.75} /> },
  { id: 'agents',    label: 'Agents',    icon: <Bot size={16} strokeWidth={1.75} /> },
  { id: 'sharing',   label: 'Sharing',   icon: <Share2 size={16} strokeWidth={1.75} /> },
  { id: 'sessions',  label: 'Sessions',  icon: <Users size={16} strokeWidth={1.75} /> },
  { id: 'settings',  label: 'Settings',  icon: <SettingsIcon size={16} strokeWidth={1.75} /> },
  { id: 'developer', label: 'Developer', icon: <Terminal size={16} strokeWidth={1.75} /> },
  { id: 'docs',      label: 'Docs',      icon: <BookOpen size={16} strokeWidth={1.75} /> },
];

const SECTION_SUBTITLE: Record<Section, string> = {
  vault:     'All your encrypted secrets',
  activity:  'Recent reads, writes, and shares',
  agents:    "Agents you've granted scoped access to",
  sharing:   'Secrets shared with teammates',
  sessions:  'Active sessions across devices',
  settings:  'Account, security, and preferences',
  developer: 'API token, CLI commands, SDK snippets',
  docs:      'Quickstart, agent setup, and full reference',
};

const MainContent: React.FC = () => {
  const { disconnect, publicKey } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => hasStoredToken());
  const [section, setSection] = useState<Section>('vault');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [prefilledData, setPrefilledData] = useState<Partial<VaultItem> | undefined>(undefined);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { items, allItems, addItem, deleteItem, decryptItem } = useVaults(searchQuery, 'All Items');

  // Handle ?action=add deep-link from the browser extension
  useEffect(() => {
    if (!isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'add') return;
    const domain   = params.get('domain') || '';
    const upstream = params.get('upstream') || '';
    setPrefilledData({
      name:   params.get('name')  || '',
      value:  params.get('value') || '',
      domain: upstream
        ? ({
            openai:    'openai.com',
            anthropic: 'anthropic.com',
            groq:      'groq.com',
            mistral:   'mistral.ai',
            cohere:    'cohere.ai',
            helius:    'helius.dev',
            '0x':      '0x.org',
            alchemy:   'alchemy.com',
          } as Record<string, string>)[upstream] || domain
        : domain,
      notes: domain ? `Detected by extension on ${domain}` : 'Detected via extension',
    });
    setIsAddModalOpen(true);
    window.history.replaceState({}, '', window.location.pathname);
  }, [isAuthenticated]);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [isSearchOpen]);

  // Cross-component nav: any child can dispatch `ks-nav` with a section id.
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<Section>).detail;
      if (detail) setSection(detail);
    };
    window.addEventListener('ks-nav', onNav as EventListener);
    return () => window.removeEventListener('ks-nav', onNav as EventListener);
  }, []);

  const handleLogout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    try { await disconnect(); } catch {}
    clearAuth();
    notifyAuthChanged();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  const fullAddr = publicKey?.toBase58() ?? getWalletAddress() ?? '';
  const shortAddr = fullAddr ? `${fullAddr.slice(0, 4)}…${fullAddr.slice(-4)}` : '—';

  const copyAddr = () => {
    if (!fullAddr) return;
    navigator.clipboard.writeText(fullAddr);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 1500);
  };

  const expiringSoon = allItems.filter(i => {
    if (!i.expiryDate) return false;
    const days = (new Date(i.expiryDate).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 14;
  }).length;

  const recentlyUsed = allItems.filter(i => Date.now() - i.lastUsedAt < 86400000 * 7).length;

  return (
    <div className="min-h-screen bg-[#05060d] text-zinc-200 flex flex-col">
      <BetaBanner />
      <div className="flex flex-1 min-h-0">
      {isSearchOpen && (
        <div className="fixed inset-0 z-[100] bg-[#05060d]/95 flex flex-col items-center justify-center p-6 backdrop-blur-md">
          <div className="w-full max-w-xl">
            <div className="flex items-center justify-between border-b border-[#1c2238] pb-4 mb-6">
              <span className="text-[12px] text-zinc-500">Search</span>
              <button onClick={() => setIsSearchOpen(false)} className="text-zinc-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search your vault…"
              className="w-full bg-transparent border-none text-2xl font-medium focus:outline-none placeholder:text-zinc-700 text-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setIsSearchOpen(false)}
            />
          </div>
        </div>
      )}

      <AddKeyModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setPrefilledData(undefined); }}
        onSave={addItem}
        initialData={prefilledData}
      />

      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-[#1c2238] bg-[#070912] flex flex-col">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-[#1c2238]">
          <div className="w-8 h-8 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center">
            <Shield size={16} className="text-[#5b8cff]" strokeWidth={1.75} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white">KeyShield</span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                section === item.id
                  ? 'bg-[#0e1430] text-white border border-[#1c2550]'
                  : 'text-zinc-400 hover:text-white hover:bg-[#0a0d1a] border border-transparent'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.id === 'developer' && (
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-[#5b8cff]/20 text-[#5b8cff] border border-[#5b8cff]/30">
                  DEV
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Wallet card */}
        <div className="p-3">
          <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a] p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-zinc-400">Connected</span>
            </div>
            <button
              onClick={copyAddr}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#070912] border border-[#141a2e] hover:border-[#1c2550] transition-colors"
              title={fullAddr}
            >
              <span className="text-[12px] font-mono text-zinc-300 truncate">{shortAddr}</span>
              {copiedAddr ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-zinc-500" />}
            </button>
            <button
              onClick={handleLogout}
              className="w-full mt-2 flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] text-zinc-400 hover:text-white hover:bg-[#11162a] transition-colors"
            >
              <LogOut size={12} /> Disconnect
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 px-8 flex items-center justify-between border-b border-[#1c2238]">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-white capitalize">{section}</h1>
            <p className="text-[12px] text-zinc-500">{SECTION_SUBTITLE[section]}</p>
          </div>
          <div className="flex items-center gap-2">
            <HealthBadge />
            <button
              onClick={() => setIsSearchOpen(true)}
              className={`w-10 h-10 rounded-lg border border-[#1c2238] flex items-center justify-center transition-colors ${
                searchQuery ? 'text-[#5b8cff] bg-[#0e1430]' : 'text-zinc-400 hover:text-white hover:bg-[#0e1430]'
              }`}
            >
              <Search size={16} />
            </button>
            {section === 'vault' && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="h-10 px-4 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] text-white text-[13px] font-medium flex items-center gap-2 transition-colors"
              >
                <Plus size={16} /> New secret
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto px-8 py-8">
          <div className="max-w-4xl mx-auto">
            {section === 'vault' && (
              <VaultSection
                items={items}
                total={allItems.length}
                expiringSoon={expiringSoon}
                recentlyUsed={recentlyUsed}
                searchQuery={searchQuery}
                onAdd={() => setIsAddModalOpen(true)}
                onDelete={deleteItem}
                onDecrypt={decryptItem}
              />
            )}
            {section === 'activity'  && <ActivitySection />}
            {section === 'agents'    && <AgentsSection />}
            {section === 'sharing'   && <SharingSection addr={fullAddr} />}
            {section === 'sessions'  && <SessionsSection onLogout={handleLogout} />}
            {section === 'settings'  && <SettingsSection addr={fullAddr} />}
            {section === 'developer' && <DeveloperSection />}
            {section === 'docs'      && <DocsSection />}
          </div>
        </div>
      </main>
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <SolanaProvider>
    <MainContent />
  </SolanaProvider>
);

export default App;
