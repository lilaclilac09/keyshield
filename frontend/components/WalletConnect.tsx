
import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LogOut, ChevronDown, Wallet } from 'lucide-react';

export const WalletConnect: React.FC = () => {
  const { wallet, connect, connected, publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = () => {
    if (!wallet) {
      setVisible(true);
    } else if (!connected) {
      connect().catch(() => {});
    } else {
      setIsOpen(!isOpen);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setIsOpen(false);
  };

  const getAddressDisplay = () => {
    if (!publicKey) return 'Not Connected';
    const addr = publicKey.toBase58();
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  if (!connected) {
    return (
      <button
        onClick={handleAction}
        disabled={connecting}
        className="px-4 py-2 bg-gradient-to-r from-[#ff2e63] to-[#9d4edd] hover:from-[#ff2e63]/90 hover:to-[#9d4edd]/90 text-white rounded-lg font-medium text-sm transition-all duration-200 shadow-[0_0_15px_rgba(255,46,99,0.3)] hover:shadow-[0_0_20px_rgba(255,46,99,0.5)] flex items-center gap-2 disabled:opacity-50"
      >
        <Wallet size={16} />
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleAction}
        className="flex items-center gap-2 px-4 py-2 bg-[#1e0a3c] border border-[#9d4edd]/30 rounded-lg hover:border-[#ff2e63]/50 transition-all duration-200 hover:shadow-[0_0_15px_rgba(255,46,99,0.2)]"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ff2e63] to-[#9d4edd] flex items-center justify-center">
          <span className="text-white text-xs font-bold">
            {publicKey?.toBase58().slice(0, 1).toUpperCase()}
          </span>
        </div>
        <span className="text-[#ffd6f5] text-sm font-medium">{getAddressDisplay()}</span>
        <ChevronDown size={16} className={`text-[#e0aaff] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-[#1e0a3c] border border-[#9d4edd]/30 rounded-lg shadow-xl overflow-hidden z-50">
          <div className="p-4 border-b border-[#1e0a3c]">
            <p className="text-xs text-[#e0aaff]/60 uppercase tracking-widest mb-1">Connected Wallet</p>
            <p className="text-sm font-mono text-[#ffd6f5] break-all">{publicKey?.toBase58()}</p>
          </div>
          <button
            onClick={handleDisconnect}
            className="w-full flex items-center gap-2 px-4 py-3 text-left text-[#ff2e63] hover:bg-[#ff2e63]/10 transition-colors"
          >
            <LogOut size={16} />
            <span className="text-sm font-medium">Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
};
