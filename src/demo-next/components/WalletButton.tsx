'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { shortAddr } from '@/lib/ks';

export function WalletButton() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
      <button
        type="button"
        onClick={() => void disconnect()}
        className="h-9 px-3 border border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-100 hover:bg-zinc-800"
      >
        {shortAddr(publicKey.toBase58())}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setVisible(true)}
      className="h-9 px-3 border border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-100 hover:bg-zinc-800"
    >
      Connect Wallet
    </button>
  );
}
