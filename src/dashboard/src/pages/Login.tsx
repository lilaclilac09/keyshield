import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Wallet, Shield, ChevronRight, Check, Key, Lock, Zap, Eye } from 'lucide-react';
import {
  detectWallets,
  connectWalletByKey,
  signWithWallet,
  generateSessionToken,
  saveToken,
  disconnectWallet,
  VAULT_KEY_MESSAGE,
} from '@keyshield/shared/auth';

const WALLET_ICONS: Record<string, string> = {
  Phantom: `data:image/svg+xml,${encodeURIComponent(`<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#AB9FF2"/><stop offset="100%" stop-color="#5C47D9"/></linearGradient></defs><rect width="40" height="40" rx="10" fill="url(#g)"/><path d="M20 8c-4 0-8 2-8 6 0 2 1 4 3 5l-2 8h14l-2-8c2-1 3-3 3-5 0-4-4-6-8-6z" fill="white" opacity="0.9"/></svg>`)}`,
  Solflare: `data:image/svg+xml,${encodeURIComponent(`<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#FC551E"/><path d="M12 26h16M12 20h16M12 14h16" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`)}`,
  Backpack: `data:image/svg+xml,${encodeURIComponent(`<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#E33E3F"/><path d="M14 16h12M14 22h12M14 28h8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`)}`,
  'Trust Wallet': `data:image/svg+xml,${encodeURIComponent(`<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#3375BB"/><path d="M20 10L12 16v8l8 6 8-6v-8L20 10z" fill="white" opacity="0.9"/></svg>`)}`,
};

type LoginStep = 'select' | 'connecting' | 'signing' | 'done';

const featureItems = [
  { icon: Shield, label: 'Multi-sig custody' },
  { icon: Key, label: 'Hardware wallet support' },
  { icon: Lock, label: 'Zero-trust architecture' },
  { icon: Zap, label: 'Real-time monitoring' },
];

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>('select');
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  useEffect(() => {
    const scan = () => setWallets(detectWallets());
    scan();
    const iv = setInterval(() => { if (step === 'select') scan(); }, 1500);
    return () => clearInterval(iv);
  }, [step]);

  const handleConnect = useCallback(async (key: string) => {
    try {
      setError(null);
      setSelectedWallet(key);
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
      console.error('[KeyShield] Login error:', err);
      setError(msg);
      setStep('select');
    }
  }, [navigate]);

  const handleDisconnect = useCallback(async () => {
    await disconnectWallet();
    setConnectedAddress(null);
    setWallets(detectWallets());
  }, []);

  const shortAddress = (addr: string) => addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : '';
  const available = wallets.filter((w: any) => w.isInstalled);

  return (
    <div className="space-y-6 min-h-screen flex items-center justify-center bg-[#030303] p-4">
      {/* Brand header */}
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center mb-4">
          <div className="w-14 h-14 rounded-xl bg-[#111] text-white flex items-center justify-center border border-[#1a1a1a]">
            <Shield size={26} strokeWidth={1.5} />
          </div>
        </div>
        <h1 className="text-3xl font-semibold tracking-wide mb-1" style={{ color: '#707070' }}>KEYSHIELD</h1>
        <p className="text-[9px] tracking-[0.35em] uppercase text-[#4a4a4a] font-medium">Protect what matters</p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-[#1a0808] border border-[#3b2020] max-w-md mx-auto">
          <p className="text-sm font-medium text-[#c62232]">{error}</p>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-lg border bg-[#080808] shadow-xl max-w-md w-full overflow-hidden" style={{ borderColor: '#0f0f0f' }}>
        <div className="px-5 py-4 border-b" style={{ borderBottomColor: '#0f0f0f' }}>
          <h3 className="text-lg font-semibold text-white">Connect your wallet</h3>
          <p className="text-sm text-[#8e8e9a] mt-1">
            {step === 'done' ? 'Successfully connected!' : step === 'connecting' ? `Connecting to ${selectedWallet}...` : 'Sign with your Solana wallet'}
          </p>
        </div>
        <div className="p-5">
          {/* Success */}
          {step === 'done' && connectedAddress && (
            <div className="flex flex-col items-center py-6">
              <div className="h-14 w-14 rounded-full bg-[#ecfdf3] flex items-center justify-center mb-3">
                <Check className="h-7 w-7 text-[#0f7b41]" />
              </div>
              <p className="text-sm font-medium" style={{ color: '#707070' }}>Wallet Connected</p>
              <span className="text-xs font-mono mt-2 px-3 py-1 rounded bg-[#0a0a0a] border border-[#0f0f0f]" style={{ color: '#8e8e9a' }}>{shortAddress(connectedAddress)}</span>
            </div>
          )}

          {/* Loading */}
          {(step === 'connecting' || step === 'signing') && (
            <div className="flex flex-col items-center py-8">
              <Shield className="h-10 w-10 mb-4 animate-pulse" style={{ color: '#303030' }} />
              <p className="text-sm font-medium" style={{ color: '#606060' }}>
                {step === 'connecting' ? `Opening ${selectedWallet}...` : 'Verifying signature...'}
              </p>
            </div>
          )}

          {/* Wallet list */}
          {step === 'select' && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] font-medium mb-3" style={{ color: '#505050' }}>Available wallets</p>
              {wallets.map((w: any) => {
                const icon = WALLET_ICONS[w.name] ?? '';
                return (
                  <button
                    key={w.key}
                    onClick={() => handleConnect(w.key)}
                    disabled={!w.isInstalled}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                      w.isInstalled ? 'hover:border-[#252525] hover:bg-[#0d0d0d] cursor-pointer' : 'opacity-40 cursor-not-allowed bg-[#0a0a0a]'
                    }`}
                    style={{ borderColor: '#0f0f0f', color: w.isInstalled ? '#808080' : '#505050' }}
                  >
                    <div className="h-10 w-10 rounded-lg bg-[#0d0d0d] flex items-center justify-center shrink-0 overflow-hidden" style={{ borderColor: '#141414', borderWidth: '1px' }}>
                      {icon ? <img src={icon} alt={w.name} className="h-6 w-6" /> : <Wallet className="h-5 w-5 text-[#404040]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm" style={{ color: '#707070' }}>{w.name}</span>
                        {w.isConnected && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[#ecfdf3] text-[#0f7b41] font-medium">Connected</span>
                        )}
                      </div>
                      {!w.isInstalled
                        ? <span className="text-xs" style={{ color: '#404040' }}>Not installed</span>
                        : w.isConnected && w.address
                          ? <span className="text-xs font-mono" style={{ color: '#606060' }}>{shortAddress(w.address)}</span>
                          : <span className="text-xs" style={{ color: '#505050' }}>Click to connect</span>
                      }
                    </div>
                    {w.isInstalled && <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#404040' }} />}
                  </button>
                );
              })}

              {/* Connected wallet */}
              {connectedAddress && step === 'select' && (
                <>
                  <div className="h-px my-4 bg-[#141414]" />
                  <div className="p-3 rounded-lg bg-[#0a0a0a] flex items-center justify-between" style={{ borderColor: '#0f0f0f', borderWidth: '1px' }}>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-[#0f7b41]" />
                      <span className="text-sm font-mono" style={{ color: '#707070' }}>{shortAddress(connectedAddress)}</span>
                    </div>
                  </div>
                </>
              )}

              {available.length === 0 && (
                <div className="text-center py-6 space-y-3">
                  <Wallet className="h-8 w-8 mx-auto" style={{ color: '#404040' }} />
                  <p className="font-medium text-sm" style={{ color: '#606060' }}>No wallet detected</p>
                  <p className="text-xs" style={{ color: '#505050' }}>Install a Solana wallet extension</p>
                </div>
              )}

              <div className="h-px bg-[#141414]" />
            </div>
          )}

          {step === 'select' && available.length > 0 && (
            <div className="text-center pt-2">
              <p className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#4a4a4a', fontWeight: 500 }}>
                Signs a message to verify ownership. No gas fee.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-2 gap-4 max-w-md w-full">
        {featureItems.map((f) => (
          <div key={f.label} className="flex items-center gap-2">
            <f.icon size={14} style={{ color: '#404040' }} />
            <span className="text-sm" style={{ color: '#505050' }}>{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
