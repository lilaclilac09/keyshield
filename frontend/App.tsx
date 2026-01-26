
import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Key, Shield, LogOut, Link2Off, Plus, FileText } from 'lucide-react';
import { VaultItem } from './types';
import { VaultItemCard } from './components/VaultItemCard';
import { AuthScreen } from './components/AuthScreen';
import { AddKeyModal } from './components/AddKeyModal';
import { ReportViewer, generateVaultReport } from './components/ReportViewer';
import { CyberpunkOverlay } from './constants';
import { SolanaProvider } from './components/SolanaProvider';
import { useWallet } from '@solana/wallet-adapter-react';
import { useVaults } from './hooks/useVaults';

const MainContent: React.FC = () => {
  const { disconnect, publicKey } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All Items');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [prefilledData, setPrefilledData] = useState<Partial<VaultItem> | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { items, allItems, addItem, deleteItem } = useVaults(searchQuery, activeFilter);
  
  // Debug: Log authentication state
  useEffect(() => {
    console.log('🔐 KeyShield Auth State:', { isAuthenticated, publicKey: publicKey?.toBase58() });
  }, [isAuthenticated, publicKey]);

  // Initial load check
  useEffect(() => {
    console.log('📊 KeyShield: MainContent loaded, items count:', allItems.length);
  }, [allItems.length]);
  
  const reportPages = React.useMemo(() => {
    const walletAddr = publicKey?.toBase58();
    return generateVaultReport(allItems, undefined, walletAddr);
  }, [allItems, publicKey]);

  useEffect(() => {
    if (isAuthenticated) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'add') {
        const name = params.get('name') || '';
        const value = params.get('value') || '';
        const domain = params.get('domain') || '';
        
        setPrefilledData({
          name,
          value,
          domain,
          notes: `Detected via extension`
        });
        setIsAddModalOpen(true);
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleLogout = async () => {
    await disconnect();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  const addr = publicKey ? `${publicKey.toBase58().slice(0, 4)}..${publicKey.toBase58().slice(-4)}` : '';

  return (
    <div className="min-h-screen bg-[#131314] text-zinc-400 flex flex-col font-mono selection:bg-orange-500/10">
      <CyberpunkOverlay />
      
      {isSearchOpen && (
        <div className="fixed inset-0 z-[100] bg-[#131314]/90 flex flex-col items-center justify-center p-6 backdrop-blur-md">
          <div className="w-full max-w-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-8">
              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">QUERY</span>
              <button onClick={() => setIsSearchOpen(false)} className="text-zinc-600 hover:text-white"><X size={16} /></button>
            </div>
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="..." 
              className="w-full bg-transparent border-none text-4xl font-bold focus:outline-none placeholder:text-zinc-800 uppercase tracking-tighter text-zinc-200"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setIsSearchOpen(false)}
            />
          </div>
        </div>
      )}

      <AddKeyModal 
        isOpen={isAddModalOpen} 
        onClose={() => {
          setIsAddModalOpen(false);
          setPrefilledData(undefined);
        }} 
        onSave={addItem} 
        initialData={prefilledData}
      />

      {isReportOpen && (
        <ReportViewer 
          pages={reportPages} 
          onClose={() => setIsReportOpen(false)}
          mode="clean"
        />
      )}

      <header className="h-16 bg-transparent px-8 flex items-center justify-between border-b border-white/[0.03]">
        <div className="flex items-center gap-4">
          <Shield size={18} className="text-orange-600/60" />
          <span className="text-sm font-bold tracking-tighter text-zinc-200">KEYSHIELD</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 opacity-60">
            <Link2Off size={12} className="text-zinc-600" title="Session Status" />
            <span className="text-[10px] text-zinc-500 font-bold">{addr}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="text-zinc-600 hover:text-orange-500 transition-colors"
            title="Disconnect"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-64 hidden lg:flex flex-col p-8 bg-transparent">
          <div className="space-y-6 mb-12">
            <SidebarItem icon={<Key size={14} />} label="VAULT" active={activeFilter === 'All Items'} onClick={() => setActiveFilter('All Items')} />
            <SidebarItem icon={<Shield size={14} />} label="SYSTEM" active={activeFilter === 'Vaults'} onClick={() => setActiveFilter('Vaults')} />
          </div>

          <div className="mt-auto opacity-30">
            <div className="w-full h-[1px] bg-zinc-800 mb-2">
              <div className="h-full bg-zinc-600" style={{ width: `${(allItems.length / 50) * 100}%` }}></div>
            </div>
            <span className="text-[8px] font-bold uppercase tracking-widest">{allItems.length}/50</span>
          </div>
        </aside>

        <main className="flex-1 p-8">
          <div className="max-w-4xl mx-auto space-y-12">
            
            <div className="flex items-center justify-end gap-6">
              <button 
                onClick={() => setIsSearchOpen(true)}
                className={`p-2 transition-all hover:text-orange-500 ${searchQuery ? 'text-orange-500' : 'text-zinc-700'}`}
              >
                <Search size={18} />
              </button>

              <button 
                onClick={() => setIsReportOpen(true)}
                className="p-2 transition-all hover:text-orange-500 text-zinc-700"
                title="View Report"
              >
                <FileText size={18} />
              </button>

              <div className="flex items-center gap-2 px-3 py-1 bg-[#1e1f20] rounded-sm border border-zinc-800/50">
                <Shield size={12} className="text-zinc-600" />
                <span className="text-xs font-bold text-zinc-500 font-mono">{allItems.length.toString().padStart(2, '0')}</span>
              </div>

              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="bg-zinc-200 hover:bg-white text-black text-[10px] font-bold h-9 px-4 rounded-sm transition-all flex items-center gap-2"
              >
                <Plus size={14} /> NEW
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-16 pb-24">
              {items.map(item => (
                <VaultItemCard key={item.id} item={item} onDelete={deleteItem} />
              ))}
              
              {items.length === 0 && (
                <div className="col-span-full py-40 text-center opacity-20">
                  <span className="text-[10px] font-bold uppercase tracking-widest">EMPTY</span>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

const SidebarItem = ({ label, active, onClick, icon }: { label: string, active?: boolean, onClick: () => void, icon: React.ReactNode }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-4 py-1 text-[11px] font-bold transition-all uppercase tracking-widest ${
      active ? 'text-orange-500/90' : 'text-zinc-700 hover:text-zinc-400'
    }`}
  >
    {icon}
    <span className="tracking-tighter">{label}</span>
  </button>
);

const App: React.FC = () => {
  React.useEffect(() => {
    console.log('✅ KeyShield App: Component mounted');
  }, []);

  return (
    <SolanaProvider>
      <MainContent />
    </SolanaProvider>
  );
};

export default App;
