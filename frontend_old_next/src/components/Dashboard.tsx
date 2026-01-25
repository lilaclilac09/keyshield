'use client';

import { useKeyShieldWallet } from '@/hooks/useWallet';
import { useVault } from '@/hooks/useVault';
import { StoreKeyForm } from './StoreKeyForm';
import { VaultDisplay } from './VaultDisplay';
import { ShareKeyDialog } from './ShareKeyDialog';
import { GoogleAIConnector } from './GoogleAIConnector';
import { CyberpunkOverlay } from './CyberpunkOverlay';
import { WalletSelector } from './WalletSelector';
import { ErrorToast, useToast, showToast } from './ErrorToast';
import { Shield, Key, Lock, Share2, Zap, LogOut, Search, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { detectKeyTypeFromContext, APIKeyType, getGeneratorInfo } from '@/lib/api-key-generators';

export function Dashboard() {
  const { isConnected, publicKey } = useKeyShieldWallet();
  const { vault, isLoading } = useVault();
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [skipWallet, setSkipWallet] = useState(false);
  const [detectedKeys, setDetectedKeys] = useState<Array<{ key: string; source: string; fieldName?: string }>>([]);
  const [showAutoDetection, setShowAutoDetection] = useState(false);
  const { toast, closeToast } = useToast();

  // Check for quickSave URL parameter (from extension popup)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const quickSaveParam = params.get('quickSave');
      if (quickSaveParam) {
        try {
          // Decode base64 key from URL
          const decodedKey = atob(quickSaveParam);
          if (decodedKey && decodedKey.length >= 16) {
            const keyType = detectKeyTypeFromContext('', decodedKey);
            setDetectedKeys([{
              key: decodedKey,
              source: 'extension',
              fieldName: getGeneratorInfo(keyType).name,
            }]);
            setShowAutoDetection(true);
            setShowStoreForm(true);
            
            // Clean up URL
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch (error) {
          console.error('Failed to decode quickSave parameter:', error);
        }
      }
    }
  }, []);

  // Auto-detect API keys from clipboard
  useEffect(() => {
    const checkClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.length >= 16) {
          // Simple detection - check if it looks like an API key
          const keyPatterns = [
            /^ghp_[a-zA-Z0-9]{36}$/, // GitHub
            /^AIza[0-9A-Za-z\-_]{35}$/, // Google/Gemini
            /^[a-zA-Z0-9]{32,64}$/, // Helius or generic
          ];
          
          for (const pattern of keyPatterns) {
            if (pattern.test(text.trim())) {
              const keyType = detectKeyTypeFromContext('', text);
              setDetectedKeys([{
                key: text.trim(),
                source: 'clipboard',
                fieldName: getGeneratorInfo(keyType).name,
              }]);
              setShowAutoDetection(true);
              break;
            }
          }
        }
      } catch (err) {
        // Clipboard access denied or not available
      }
    };

    // Check clipboard on mount and periodically
    checkClipboard();
    const interval = setInterval(checkClipboard, 5000);
    return () => clearInterval(interval);
  }, []);

  // Skip wallet connection - go directly to vault
  if (!isConnected && !skipWallet) {
    // Detect Safari browser
    const isSafari = typeof window !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden">
        <CyberpunkOverlay />
        {/* Background Decor */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/20 blur-[120px] rounded-full"></div>
          <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-red-600/10 blur-[80px] rounded-full"></div>
        </div>

        <div className="relative w-full max-w-sm px-6 py-12 bg-[#0a0a0a]/80 border border-white/10 backdrop-blur-xl rounded-2xl shadow-2xl cyber-glow">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600/10 border border-purple-500/30 rounded-2xl mb-4 relative group">
              <Zap className="text-purple-500 group-hover:scale-110 transition-transform" size={32} />
              <div className="absolute inset-0 bg-purple-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">KeyShield</h1>
            <p className="text-white/40 text-[10px] uppercase tracking-[0.3em] mt-1">Sovereign Encryption Vault</p>
          </div>

          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-xs font-bold text-white/60 uppercase tracking-widest">Access Your Vault</h2>
              <p className="text-[10px] text-white/20 leading-relaxed max-w-[240px] mx-auto uppercase">
                Manage your encrypted API keys securely.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 w-full">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSkipWallet(true);
                }}
                className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl transition-all shadow-lg shadow-purple-500/20 active:scale-95 flex items-center justify-center gap-2 text-white font-bold uppercase tracking-widest text-xs"
              >
                <Zap size={18} />
                Access Vault
              </button>
            </div>
            
            <div className="text-center">
              <span className="text-[9px] font-mono text-white/10 uppercase tracking-tighter">
                [ NODE_STATUS: SYNCED // LIT_v2.1.0 ]
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative">
      <CyberpunkOverlay />
      
      {/* Main Header */}
      <header className="h-16 border-b border-white/5 backdrop-blur-md sticky top-0 z-40 bg-black/50">
        <div className="max-w-6xl mx-auto h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-purple-600/20 border border-purple-500/40 rounded-lg">
              <Zap size={20} className="text-purple-500" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">KeyShield</span>
              <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-green-500/10 text-green-500 border border-green-500/20 rounded-sm align-middle font-bold uppercase">SECURED</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isConnected && publicKey ? (
              <>
                <div className="px-3 py-1.5 bg-white/5 rounded-full border border-white/10 flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-mono text-white/60">
                    {publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-4)}
                  </span>
                </div>
                <WalletSelector />
              </>
            ) : (
              <div className="px-3 py-1.5 bg-white/5 rounded-full border border-white/10 flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-mono text-white/60">
                  OFFLINE MODE
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Personal Vault</h2>
            <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1 font-mono">
              // ACTIVE_SESSION: SOLANA_DEVNET_LIT_V2
            </p>
          </div>
          <div className="flex items-center gap-3">
            {vault && (
              <button
                onClick={() => setShowShareDialog(true)}
                className="bg-purple-600 hover:bg-purple-500 p-2.5 rounded-xl transition-all shadow-lg shadow-purple-500/20 active:scale-95 flex items-center gap-2 px-4"
              >
                <Share2 size={18} />
                <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Share</span>
              </button>
            )}
            <button
              onClick={() => setShowStoreForm(true)}
              className="bg-purple-600 hover:bg-purple-500 p-2.5 rounded-xl transition-all shadow-lg shadow-purple-500/20 active:scale-95 flex items-center gap-2 px-4"
            >
              <Key size={18} />
              <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">
                {vault ? 'Update' : 'New Key'}
              </span>
            </button>
          </div>
        </div>

        {/* Auto-Detection Alert */}
        {showAutoDetection && detectedKeys.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 cyber-glow">
            <div className="flex items-start gap-3">
              <Search className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-yellow-400 mb-1">API Key Detected</h3>
                <p className="text-xs text-yellow-300/80 mb-3">
                  Found {detectedKeys.length} API key(s) in your clipboard. Would you like to save it to your vault?
                </p>
                <div className="space-y-2">
                  {detectedKeys.map((detected, idx) => {
                    const keyType = detectKeyTypeFromContext(detected.fieldName || '', detected.key);
                    const generatorInfo = getGeneratorInfo(keyType);
                    return (
                      <div key={idx} className="bg-black/30 rounded p-2 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-white/60 truncate">
                            {detected.key.slice(0, 20)}...
                          </p>
                          <p className="text-[10px] text-white/40 mt-1">
                            {generatorInfo.name} • {detected.source}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setShowStoreForm(true);
                            // Pre-fill the form with detected key
                            // This would need to be passed to StoreKeyForm
                            setShowAutoDetection(false);
                          }}
                          className="ml-3 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-xs font-bold uppercase tracking-wider rounded transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => setShowAutoDetection(false)}
                  className="mt-3 text-xs text-yellow-400/60 hover:text-yellow-400"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Google AI Connector */}
        <GoogleAIConnector />

        {/* Vault Status */}
        {isLoading ? (
          <div className="bg-[#111] border border-white/5 rounded-lg p-8 text-center cyber-glow">
            <div className="relative inline-block">
              <div className="w-24 h-24 border-2 border-purple-500 rounded-full border-t-transparent animate-spin"></div>
              <Zap size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-500 animate-pulse" />
            </div>
            <p className="mt-4 text-white/60 font-mono text-xs uppercase tracking-widest">Loading vault...</p>
          </div>
        ) : vault ? (
          <VaultDisplay vault={vault} />
        ) : (
          <div className="py-32 border border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-center bg-white/[0.02] cyber-glow">
            <div className="p-4 bg-white/5 rounded-full mb-6">
              <Shield size={40} className="text-white/10" />
            </div>
            <p className="text-white/20 text-[10px] font-bold uppercase tracking-[0.2em] mb-2">Vault is currently empty</p>
            <p className="text-white/10 text-[9px] font-mono uppercase tracking-wider mb-6">
              // STORE YOUR FIRST API KEY TO INITIALIZE
            </p>
            <button
              onClick={() => setShowStoreForm(true)}
              className="px-6 py-2 border border-purple-500/30 text-purple-400 text-[10px] font-bold uppercase tracking-widest hover:bg-purple-500/10 rounded-full transition-colors"
            >
              Create Initial Credential
            </button>
          </div>
        )}

        {/* Modals */}
        {showStoreForm && (
          <StoreKeyForm
            onClose={() => {
              setShowStoreForm(false);
              setDetectedKeys([]);
            }}
            existingVault={vault}
            initialKey={detectedKeys.length > 0 ? detectedKeys[0].key : undefined}
          />
        )}

        {showShareDialog && vault && (
          <ShareKeyDialog
            vault={vault}
            onClose={() => setShowShareDialog(false)}
          />
        )}
      </main>
      
      {/* Error Toast */}
      <ErrorToast toast={toast} onClose={closeToast} />
    </div>
  );
}
