
import React, { useState, useEffect } from 'react';
import { VaultItem } from './types';
import { AuthScreen } from './components/AuthScreen';
import { AddKeyModal } from './components/AddKeyModal';
import { ReportViewer, generateVaultReport } from './components/ReportViewer';
import { SolanaProvider } from './components/SolanaProvider';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { VaultTable } from './components/VaultTable';
import { useWallet } from '@solana/wallet-adapter-react';
import { useVaults } from './hooks/useVaults';

const MainContent: React.FC = () => {
  const { publicKey } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSidebarItem, setActiveSidebarItem] = useState('vault');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [prefilledData, setPrefilledData] = useState<Partial<VaultItem> | undefined>(undefined);

  const { items, allItems, addItem, deleteItem } = useVaults(searchQuery, 'All Items');
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/App.tsx:26',message:'main_content_render',data:{isAuthenticated,itemsCount:items.length,allItemsCount:allItems.length,hasPublicKey:!!publicKey},timestamp:Date.now(),sessionId:'debug-session',runId:'pre',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  
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


  if (!isAuthenticated) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/App.tsx:66',message:'render_auth_screen',data:{isAuthenticated},timestamp:Date.now(),sessionId:'debug-session',runId:'pre',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-[#0f001f] text-[#ffd6f5] flex">
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

      <Sidebar 
        activeItem={activeSidebarItem} 
        onItemClick={setActiveSidebarItem}
      />

      <div className="flex-1 flex flex-col">
        <Header
          title="Vault Keys"
          count={allItems.length}
          subtitle="Create and manage your encrypted API keys"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onCreateClick={() => setIsAddModalOpen(true)}
        />

        <main className="flex-1 p-8 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {allItems.length === 0 ? (
              <div className="mt-32 text-center text-2xl text-pink-300">
                No keys yet — store your first pretty key!
              </div>
            ) : items.length === 0 ? (
              <div className="mt-24 text-center text-xl text-pink-300">
                No matches for this search.
              </div>
            ) : (
              <VaultTable items={items} onDelete={deleteItem} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

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
