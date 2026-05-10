import { useState, useEffect, useCallback } from 'react';
import { Shield, Check, Loader2, Wallet } from 'lucide-react';
import {
  detectWallets,
  connectWalletByKey,
  signWithWallet,
  generateSessionToken,
  saveToken,
  VAULT_KEY_MESSAGE,
  type WalletInfo,
} from '@keyshield/shared/auth';

const navItems = ["Solutions", "Technology", "Developers", "Company", "Docs"];

export default function LandingNav() {
  const [walletOpen, setWalletOpen] = useState(false);
  const [step, setStep] = useState<'select' | 'connecting' | 'done'>('select');
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    const scan = () => setWallets(detectWallets());
    scan();
    const iv = setInterval(scan, 2000);
    return () => clearInterval(iv);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!walletOpen) return;
    const handler = (e: MouseEvent) => {
      const el = document.querySelector('.walletNavWrap');
      if (el && !el.contains(e.target as Node)) setWalletOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [walletOpen]);

  const handleConnect = useCallback(async (key: string) => {
    try {
      setStep('connecting');
      const walletInfo = await connectWalletByKey(key);
      setAddress(walletInfo.address ?? null);
      const signatureBytes = await signWithWallet(VAULT_KEY_MESSAGE, walletInfo.provider);
      const token = await generateSessionToken(walletInfo.address!, signatureBytes);
      saveToken(token, true);
      setStep('done');
      setWalletOpen(false);
    } catch (err) {
      console.error('[KeyShield] Wallet connect error:', err);
      setStep('select');
    }
  }, []);

  const available = wallets.filter(w => w.isInstalled);
  const shortAddr = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : '';

  return (
    <header className="nav">
      <a className="brand" href="#">
        <span className="brandMark" />
        <span>KEYSHIELD<small>for autonomous finance</small></span>
      </a>
      <nav className="navLinks">
        {navItems.map((x) => <a key={x}>{x}</a>)}

        {/* Wallet Connect */}
        <div className="walletNavWrap" style={{ position: 'relative' }}>
          <button
            className={`walletNavBtn ${step === 'done' ? 'walletNavBtn--connected' : ''}`}
            onClick={() => setWalletOpen(!walletOpen)}
          >
            <Shield size={10} />
            {step === 'done' && shortAddr ? shortAddr : 'Connect Wallet'}
          </button>

          {walletOpen && (
            <div className="walletNavDropdown">
              {step === 'done' ? (
                <div className="walletNavDone">
                  <Check size={14} />
                  <span>Connected</span>
                  {shortAddr && <small>{shortAddr}</small>}
                </div>
              ) : step === 'connecting' ? (
                <div className="walletNavConnecting">
                  <Loader2 size={14} className="spinner" />
                  <span>Connecting...</span>
                </div>
              ) : available.length > 0 ? (
                <>
                  <div className="walletNavLabel">Available wallets</div>
                  {available.map(w => (
                    <button key={w.key} className="walletNavItem" onClick={() => handleConnect(w.key)}>
                      <Wallet size={12} />
                      <span>{w.name}</span>
                      {w.isConnected && <Check size={12} className="walletNavItem__check" />}
                    </button>
                  ))}
                </>
              ) : (
                <div className="walletNavEmpty">
                  <Wallet size={14} />
                  <span>No wallet detected</span>
                  <small>Install Phantom or Solflare extension</small>
                </div>
              )}
            </div>
          )}
        </div>

        <a className="launchTop" href="/app">Launch App →</a>
      </nav>
    </header>
  );
}
