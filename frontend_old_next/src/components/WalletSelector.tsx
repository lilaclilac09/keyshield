'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletName } from '@solana/wallet-adapter-base';
import { showToast } from './ErrorToast';
import { Wallet, ChevronDown, X, Loader2 } from 'lucide-react';

interface WalletSelectorProps {
  onSelect?: () => void;
}

export function WalletSelector({ onSelect }: WalletSelectorProps) {
  const { wallets, select, disconnect, connecting, connected, wallet } = useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedWalletName, setSelectedWalletName] = useState<WalletName | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const handleWalletSelect = async (walletName: WalletName) => {
    try {
      setSelectedWalletName(walletName);
      if (connected) {
        await disconnect();
        // Small delay to ensure disconnect completes
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      // Only select if user explicitly wants to connect
      // This prevents auto-connection
      select(walletName);
      setShowDropdown(false);
      onSelect?.();
    } catch (error: any) {
      console.error('Error selecting wallet:', error);
      setSelectedWalletName(null);
      showToast(error?.message || 'Failed to connect wallet', 'error');
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setShowDropdown(false);
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  const getWalletButtonText = () => {
    if (connecting) return 'Connecting...';
    if (connected && wallet) return `Change Wallet`;
    return 'Select Wallet';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={connecting}
        className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-white/90 disabled:opacity-50 disabled:cursor-not-allowed cyber-glow"
      >
        {connecting ? (
          <Loader2 size={16} className="animate-spin text-purple-400" />
        ) : (
          <Wallet size={16} />
        )}
        <span className="text-[10px] font-bold uppercase tracking-widest">
          {getWalletButtonText()}
        </span>
        <ChevronDown size={14} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden cyber-glow">
          <div className="p-3">
            {connected && (
              <div className="mb-3">
                <div className="text-[9px] font-mono text-white/40 uppercase tracking-widest px-3 py-1.5 mb-2">
                  Current Wallet
                </div>
                {wallet && (
                  <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-3 mb-2">
                    {wallet.adapter.icon && (
                      <img
                        src={wallet.adapter.icon}
                        alt={wallet.adapter.name}
                        className="w-6 h-6 rounded"
                      />
                    )}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-white/90">
                        {wallet.adapter.name}
                      </div>
                      <div className="text-[9px] text-green-400 font-mono uppercase">
                        Connected
                      </div>
                    </div>
                  </div>
                )}
                <button
                  onClick={handleDisconnect}
                  className="w-full flex items-center gap-3 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors text-red-400"
                >
                  <X size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Disconnect</span>
                </button>
              </div>
            )}
            
            <div className="text-[9px] font-mono text-white/40 uppercase tracking-widest px-3 py-2 border-t border-white/5 pt-3">
              {connected ? 'Switch to Another Wallet' : 'Available Wallets'}
            </div>
            
              <div className="max-h-64 overflow-y-auto mt-2 space-y-1">
                {wallets.map((w) => {
                  const isCurrentWallet = !!(connected && wallet && wallet.adapter.name === w.adapter.name);
                  const isSelected = selectedWalletName === w.adapter.name;
                
                return (
                  <button
                    key={w.adapter.name}
                    onClick={() => !isCurrentWallet && handleWalletSelect(w.adapter.name)}
                    disabled={connecting || isCurrentWallet}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                      isCurrentWallet
                        ? 'bg-purple-500/10 border border-purple-500/20 opacity-60 cursor-not-allowed'
                        : 'hover:bg-white/5 border border-transparent hover:border-white/10'
                    } ${isSelected && connecting ? 'bg-purple-500/20' : ''}`}
                  >
                    {w.adapter.icon && (
                      <img
                        src={w.adapter.icon}
                        alt={w.adapter.name}
                        className="w-6 h-6 rounded"
                      />
                    )}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-white/90">
                        {w.adapter.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {w.readyState === 'Installed' && (
                          <span className="text-[9px] text-green-400 font-mono uppercase">
                            Installed
                          </span>
                        )}
                        {w.readyState === 'NotDetected' && (
                          <span className="text-[9px] text-white/40 font-mono uppercase">
                            Not Installed
                          </span>
                        )}
                        {w.readyState === 'Loadable' && (
                          <span className="text-[9px] text-blue-400 font-mono uppercase">
                            Available
                          </span>
                        )}
                        {isCurrentWallet && (
                          <span className="text-[9px] text-purple-400 font-mono uppercase">
                            Current
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && connecting && (
                      <Loader2 size={16} className="animate-spin text-purple-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
