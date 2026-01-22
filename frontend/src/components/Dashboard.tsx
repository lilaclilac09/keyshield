'use client';

import { useState } from 'react';
import { useKeyShieldWallet } from '@/hooks/useWallet';
import { useVault } from '@/hooks/useVault';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { StoreKeyForm } from './StoreKeyForm';
import { VaultDisplay } from './VaultDisplay';
import { ShareKeyDialog } from './ShareKeyDialog';
import { Shield, Key, Lock, Share2 } from 'lucide-react';

export function Dashboard() {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Dashboard.tsx:12',message:'Dashboard component rendering',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const { isConnected, publicKey } = useKeyShieldWallet();
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Dashboard.tsx:14',message:'Before useVault call',data:{isConnected},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const { vault, isLoading } = useVault();
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Dashboard.tsx:16',message:'After useVault call',data:{hasVault:!!vault,isLoading},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Shield className="w-16 h-16 text-blue-500 mb-4" />
        <h2 className="text-2xl font-semibold mb-4">Connect Your Wallet</h2>
        <p className="text-gray-400 mb-6">
          Connect your Solana wallet to start managing your API keys securely
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Your Vault</h2>
          <p className="text-sm text-gray-400 mt-1">
            {publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-8)}
          </p>
        </div>
        <div className="flex gap-3">
          {vault && (
            <>
              <button
                onClick={() => setShowShareDialog(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Share Key
              </button>
            </>
          )}
          <button
            onClick={() => setShowStoreForm(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Key className="w-4 h-4" />
            {vault ? 'Update Key' : 'Store Key'}
          </button>
        </div>
      </div>

      {/* Vault Status */}
      {isLoading ? (
        <div className="bg-gray-900 rounded-lg p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading vault...</p>
        </div>
      ) : vault ? (
        <VaultDisplay vault={vault} />
      ) : (
        <div className="bg-gray-900 rounded-lg p-8 text-center border-2 border-dashed border-gray-700">
          <Lock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Vault Found</h3>
          <p className="text-gray-400 mb-6">
            Store your first API key to create a vault
          </p>
          <button
            onClick={() => setShowStoreForm(true)}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors"
          >
            Create Vault
          </button>
        </div>
      )}

      {/* Modals */}
      {showStoreForm && (
        <StoreKeyForm
          onClose={() => setShowStoreForm(false)}
          existingVault={vault}
        />
      )}

      {showShareDialog && vault && (
        <ShareKeyDialog
          vault={vault}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </div>
  );
}
