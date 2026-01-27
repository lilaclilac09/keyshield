
import React from 'react';
import { PhantomProvider } from '@phantom/react-sdk';
import type { PhantomSDKConfig } from '@phantom/react-sdk';

interface Props {
  children: React.ReactNode;
}

export const PhantomEmbeddedProvider: React.FC<Props> = ({ children }) => {
  // Configure Phantom SDK for Devnet (matching current SolanaProvider setup)
  // The config supports multiple auth providers and Solana chain configuration
  const config: PhantomSDKConfig = {
    providers: ['google', 'apple', 'phantom', 'device'], // Available auth providers
    embeddedWalletType: 'user-wallet', // User-controlled embedded wallet
    addressTypes: ['solana'], // Solana addresses
  };

  return (
    <PhantomProvider
      config={config}
      appName="KeyShield"
      appIcon="/logo.svg" // KeyShield shield logo
    >
      {children}
    </PhantomProvider>
  );
};
