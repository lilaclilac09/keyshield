'use client';

import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';

export function useKeyShieldWallet() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const isConnected = wallet.connected && wallet.publicKey !== null;
  const publicKey = wallet.publicKey;

  return {
    ...wallet,
    connection,
    isConnected,
    publicKey,
    connect: wallet.connect,
    disconnect: wallet.disconnect,
    sendTransaction: wallet.sendTransaction,
  };
}
