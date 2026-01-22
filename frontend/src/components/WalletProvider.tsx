'use client';

import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { 
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  WalletConnectWalletAdapter,
  LedgerWalletAdapter,
  TorusWalletAdapter,
  CoinbaseWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';
import { ErrorBoundary } from './ErrorBoundary';

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Create QueryClient using useState to ensure proper isolation per client
  // This is the recommended pattern for Next.js App Router
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 60 * 1000, // 1 minute
          },
        },
      })
  );

  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => {
    return process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(network);
  }, [network]);

  const wallets = useMemo(
    () => {
      // Get WalletConnect project ID from environment or use default
      const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'c8a62035-6378-4ddd-9cde-ab3967305ebc';
      
      // Prioritize WalletConnect for Safari and cross-platform compatibility
      // WalletConnect allows users to connect with any Solana wallet via QR code
      const walletAdapters = [
        // WalletConnect first - works on all platforms including Safari without extensions
        // This enables connection via QR code to any Solana wallet (Phantom, Solflare, etc.)
        new WalletConnectWalletAdapter({
          network: network,
          options: {
            projectId: walletConnectProjectId,
            metadata: {
              name: 'KeyShield',
              description: 'Private API Vault on Solana with ZK proofs, MPC, and Lit Protocol',
              url: typeof window !== 'undefined' ? window.location.origin : 'https://keyshield.app',
              icons: typeof window !== 'undefined' 
                ? [`${window.location.origin}/favicon.ico`]
                : ['https://keyshield.app/favicon.ico'],
            },
          },
        }),
        // Browser extension wallets (will be detected if available)
        // These work automatically if the extension is installed
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
        // Additional wallet adapters for broader compatibility
        new LedgerWalletAdapter(),
        new TorusWalletAdapter(),
        new CoinbaseWalletAdapter(),
      ];

      return walletAdapters;
    },
    [network]
  );

  if (!queryClient) {
    throw new Error('QueryClient not initialized');
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider endpoint={endpoint}>
        <SolanaWalletProvider wallets={wallets} autoConnect={false}>
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </SolanaWalletProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
