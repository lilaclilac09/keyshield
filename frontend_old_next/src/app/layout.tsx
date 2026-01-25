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
  return (
    <html lang="en" className="bg-black">
      <body className="bg-black text-white min-h-screen">
        <div className="scanline"></div>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
