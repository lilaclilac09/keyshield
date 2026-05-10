import { useState, useEffect, useCallback } from 'react';
import { Shield, Wallet, ChevronRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button, Separator } from '@keyshield/ui';
import {
  detectWallets,
  connectWalletByKey,
  disconnectWallet,
  signWithWallet,
  generateSessionToken,
  saveToken,
  VAULT_KEY_MESSAGE,
  type WalletInfo,
} from '@keyshield/shared/auth';

const WALLET_ICONS: Record<string, string> = {
  Phantom: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Phantom_App_Logo.png',
  Solflare: 'https://solflare.com/static/solflare-logo.png',
};

export default function WalletConnect() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'select' | 'connecting' | 'done'>('select');
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  useEffect(() => {
    const scan = () => setWallets(detectWallets());
    scan();
    const iv = setInterval(scan, 2000);
    return () => clearInterval(iv);
  }, []);

  const handleConnect = useCallback(async (key: string) => {
    try {
      setError(null);
      setStep('connecting');
      const walletInfo = await connectWalletByKey(key);
      setConnectedAddress(walletInfo.address);
      setStep('signing');
      const signatureBytes = await signWithWallet(VAULT_KEY_MESSAGE, walletInfo.provider);
      const token = await generateSessionToken(walletInfo.address!, signatureBytes);
      saveToken(token, true);
      setStep('done');
      setTimeout(() => navigate('/app'), 1000);
    } catch (err: unknown) {
      let msg = 'Unknown error';
      if (err instanceof Error) msg = err.message;
      else if (typeof err === 'string') msg = err;
      console.error('[KeyShield] Wallet connect error:', err);
      setError(msg);
      setStep('select');
    }
  }, [navigate]);

  const shortAddress = (addr: string) => addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : '';

  if (step === 'done') {
    return (
      <div className="wallet-connect-done">
        <Shield className="wallet-connect-done__icon" />
        <span className="wallet-connect-done__text">Wallet Connected</span>
      </div>
    );
  }

  if (step === 'connecting') {
    return (
      <div className="wallet-connect-loading">
        <div className="spinner" />
        <span>Connecting...</span>
      </div>
    );
  }

  const available = wallets.filter(w => w.isInstalled);

  return (
    <div className="wallet-connect">
      {error && (
        <div className="wallet-connect__error">{error}</div>
      )}
      {available.length > 0 && (
        <div className="wallet-connect__list">
          <span className="wallet-connect__label">Available wallets</span>
          {available.map(w => (
            <button
              key={w.key}
              className={`wallet-connect__item ${w.isConnected ? 'active' : ''}`}
              onClick={() => handleConnect(w.key)}
            >
              <Wallet className="wallet-connect__icon" />
              <span>{w.name}</span>
              {w.isConnected && <Check className="wallet-connect__check" />}
            </button>
          ))}
        </div>
      )}
      {available.length === 0 && (
        <div className="wallet-connect__empty">
          <Wallet className="wallet-connect__empty-icon" />
          <span>No wallet detected</span>
          <p className="wallet-connect__empty-hint">Install a Solana wallet extension</p>
        </div>
      )}
    </div>
  );
}
