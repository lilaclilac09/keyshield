'use client';

import { useMemo, useState, useEffect } from 'react';
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
  UnsafeBurnerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';
import { ErrorBoundary } from './ErrorBoundary';

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WalletProvider.tsx:21',message:'WalletProvider initializing',data:{hasWindow:typeof window !== 'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  }, []);
  // #endregion

  // Create QueryClient using useState to ensure proper isolation per client
  // This is the recommended pattern for Next.js App Router
  const [queryClient] = useState(
    () => {
      // #region agent log
      if (typeof window !== 'undefined') {
        fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WalletProvider.tsx:28',message:'QueryClient created',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      }
      // #endregion
      return new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 60 * 1000, // 1 minute
          },
        },
      });
    }
  );

  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => {
    // #region agent log
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(network);
    if (typeof window !== 'undefined') {
      fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WalletProvider.tsx:42',message:'RPC endpoint configured',data:{rpcUrl,hasEnvVar:!!process.env.NEXT_PUBLIC_RPC_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    }
    // #endregion
    return rpcUrl;
  }, [network]);

  const wallets = useMemo(
    () => {
      // Get WalletConnect project ID from environment or use default
      const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'c8a62035-6378-4ddd-9cde-ab3967305ebc';
      
      // Prioritize WalletConnect for Safari and cross-platform compatibility
      // WalletConnect allows users to connect with any Solana wallet via QR code
      const walletAdapters = [
        // Local burner wallet for development/testing (auto-generates keypair, no extension needed)
        // Useful for Safari testing without browser extensions
        new UnsafeBurnerWalletAdapter(),
        // WalletConnect - works on all platforms including Safari without extensions
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
    // #region agent log
    if (typeof window !== 'undefined') {
      fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WalletProvider.tsx:84',message:'QueryClient check failed',data:{queryClient:!!queryClient},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    }
    // #endregion
    throw new Error('QueryClient not initialized');
  }

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WalletProvider.tsx:95',message:'WalletProvider render complete',data:{walletsCount:wallets.length,endpoint},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  }, [wallets.length, endpoint]);
  // #endregion

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
