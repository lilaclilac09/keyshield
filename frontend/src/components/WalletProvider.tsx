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
  SolletWalletAdapter,
  SolletExtensionWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WalletProvider.tsx:13',message:'WalletProvider rendering start',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{});
  }
  // #endregion

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

  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WalletProvider.tsx:30',message:'QueryClient created',data:{hasQueryClient:!!queryClient},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{});
  }
  // #endregion

  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => {
    return process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(network);
  }, [network]);

  const wallets = useMemo(
    () => {
      const walletAdapters = [
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
        new WalletConnectWalletAdapter({
          network: network,
          options: {
            projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'c8a62035-6378-4ddd-9cde-ab3967305ebc', // Using Helius project ID as fallback
            metadata: {
              name: 'KeyShield',
              description: 'Private API Vault on Solana',
              url: typeof window !== 'undefined' ? window.location.origin : 'https://keyshield.app',
              icons: [],
            },
          },
        }),
        new LedgerWalletAdapter(),
        new TorusWalletAdapter(),
        new CoinbaseWalletAdapter(),
        new SolletWalletAdapter({ network }),
        new SolletExtensionWalletAdapter({ network }),
      ];

      return walletAdapters;
    },
    [network]
  );

  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WalletProvider.tsx:50',message:'Rendering QueryClientProvider',data:{hasQueryClient:!!queryClient},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{});
  }
  // #endregion

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={endpoint}>
        <SolanaWalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </SolanaWalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
