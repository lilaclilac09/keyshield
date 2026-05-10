/**
 * SolanaProvider — wraps the dashboard with @solana/wallet-adapter-react.
 *
 * Cluster + RPC are configurable via Vite env:
 *   - VITE_SOLANA_CLUSTER  (devnet | testnet | mainnet-beta)  default: devnet
 *   - VITE_KEYSHIELD_RPC_URL                                  default: clusterApiUrl(cluster)
 *
 * The wallet-adapter-react-ui CSS is imported once here so consumers can
 * use <WalletMultiButton/> styling without a separate import.
 */
import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

interface Props {
  children: React.ReactNode;
}

function resolveCluster(): WalletAdapterNetwork {
  const raw = (import.meta.env.VITE_SOLANA_CLUSTER ?? 'devnet').toLowerCase();
  if (raw === 'mainnet' || raw === 'mainnet-beta') return WalletAdapterNetwork.Mainnet;
  if (raw === 'testnet') return WalletAdapterNetwork.Testnet;
  return WalletAdapterNetwork.Devnet;
}

export const SolanaProvider: React.FC<Props> = ({ children }) => {
  const network = useMemo(() => resolveCluster(), []);
  const endpoint = useMemo(
    () => import.meta.env.VITE_KEYSHIELD_RPC_URL ?? clusterApiUrl(network),
    [network],
  );
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })],
    [network],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
