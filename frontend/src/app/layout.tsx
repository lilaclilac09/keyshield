import type { Metadata } from 'next';
import './globals.css';
import { WalletProvider } from '@/components/WalletProvider';

export const metadata: Metadata = {
  title: 'KeyShield - Private API Vault on Solana',
  description: 'Decentralized API key management with ZK proofs, MPC, and Lit Protocol',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'layout.tsx:18',message:'RootLayout rendering',data:{url:window.location.href,userAgent:window.navigator.userAgent},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  }
  // #endregion

  return (
    <html lang="en" className="bg-black">
      <body className="bg-black text-white min-h-screen">
        <div className="scanline"></div>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
