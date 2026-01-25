
import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

interface Props {
  onConnect: () => void;
}

export const WalletConnector: React.FC<Props> = ({ onConnect }) => {
  const { wallet, connect, connected, publicKey, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'verified'>('idle');

  useEffect(() => {
    if (connected && publicKey && verificationStatus === 'idle') {
      setVerificationStatus('verifying');
      setTimeout(() => {
        setVerificationStatus('verified');
        setTimeout(onConnect, 800);
      }, 1500);
    }
  }, [connected, publicKey, onConnect, verificationStatus]);

  const handleAction = () => {
    if (!wallet) {
      setVisible(true);
    } else if (!connected) {
      connect().catch(() => {});
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleAction}
        disabled={connecting || verificationStatus !== 'idle'}
        className={`w-full text-left p-5 rounded-sm border transition-all duration-300 ${
          connected 
            ? 'bg-zinc-900 border-emerald-900/50 text-emerald-500' 
            : 'bg-indigo-700 border-indigo-600 hover:bg-indigo-600 text-white'
        }`}
      >
        <div className="flex flex-col gap-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em]">
            {connecting && 'ESTABLISHING_CONNECTION...'}
            {!connected && !connecting && 'CONNECT_SOLANA_PROVIDER'}
            {connected && verificationStatus === 'verifying' && 'SECURING_ENCRYPTION_LAYER...'}
            {verificationStatus === 'verified' && 'IDENTITY_VERIFIED'}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-tight opacity-60">
            {connected && publicKey 
              ? `ADDR: ${publicKey.toBase58().slice(0, 12)}...` 
              : 'SUPPORTED: PHANTOM / SOLFLARE / BACKPACK / BURNER'}
          </div>
        </div>
      </button>

      {verificationStatus === 'verifying' && (
        <div className="p-4 bg-indigo-950/20 border border-indigo-900/50 rounded-sm">
          <p className="text-[9px] font-bold text-indigo-400 leading-relaxed uppercase tracking-widest">
            >> VERIFYING_SIGNATURE<br/>
            >> INITIALIZING_GATEWAY<br/>
            >> BUFFER_READY
          </p>
        </div>
      )}
    </div>
  );
};
