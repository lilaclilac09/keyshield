import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Wallet, Check, Loader2, AlertCircle, Fingerprint } from 'lucide-react';
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

type Phase = 'idle' | 'connecting' | 'signing' | 'done' | 'error';

export default function Login() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  useEffect(() => {
    const scan = () => setWallets(detectWallets());
    scan();
    const iv = setInterval(() => { if (phase === 'idle') scan(); }, 1500);
    return () => clearInterval(iv);
  }, [phase]);

  const handleConnect = useCallback(async (key: string) => {
    try {
      setError(null);
      setSelectedWallet(key);
      setPhase('connecting');
      const walletInfo = await connectWalletByKey(key);
      setConnectedAddress(walletInfo.address);
      setPhase('signing');
      const signatureBytes = await signWithWallet(VAULT_KEY_MESSAGE, walletInfo.provider);
      const token = await generateSessionToken(walletInfo.address!, signatureBytes);
      saveToken(token, true);
      setPhase('done');
      setTimeout(() => navigate('/app'), 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      console.error('[KeyShield] Login error:', err);
      setError(msg);
      setPhase('error');
    }
  }, [navigate]);

  const retry = useCallback(async () => {
    await disconnectWallet().catch(() => {});
    setError(null);
    setConnectedAddress(null);
    setSelectedWallet(null);
    setPhase('idle');
  }, []);

  const shortAddress = (addr: string) => addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : '';
  const installed = wallets.filter((w: any) => w.isInstalled);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-6">
      <div className="w-full max-w-md flex flex-col items-center text-center">
        {/* Brand */}
        <div className="w-20 h-20 rounded-[3px] bg-[#0a0a0a] border border-zinc-800/50 flex items-center justify-center mb-8">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke="white" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
        <h1 className="text-[34px] leading-tight font-bold text-white tracking-tight uppercase">KeyShield</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-zinc-400 max-w-sm">
          Connect your Solana wallet to access your encrypted secrets.
        </p>

        {/* Body */}
        <div className="w-full mt-10">
          {phase === 'error' && (
            <div className="w-full space-y-3">
              <div className="px-4 py-3 rounded-[3px] bg-red-950/40 border border-red-900/60 flex items-start gap-3">
                <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-[13px] text-red-300 leading-relaxed break-words text-left">{error}</p>
              </div>
              <button type="button" onClick={retry} className="w-full py-2 rounded-[3px] border border-zinc-800 text-[13px] text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
                Try Again
              </button>
            </div>
          )}

          {phase === 'done' && connectedAddress && (
            <div className="rounded-[3px] border border-zinc-800/50 p-2 bg-[#0a0a0a]">
              <div className="flex items-center gap-3 px-5 py-4 rounded-[3px] border border-emerald-900/60 bg-emerald-950/20 text-emerald-300">
                <Check size={18} className="text-emerald-400 shrink-0" />
                <span className="text-[15px] font-semibold uppercase tracking-wider">{shortAddress(connectedAddress)}</span>
              </div>
            </div>
          )}

          {(phase === 'connecting' || phase === 'signing') && (
            <div className="rounded-[3px] border border-zinc-800/50 p-2 bg-[#0a0a0a]">
              <div className="flex items-center gap-3 px-5 py-4 rounded-[3px] border border-zinc-800 bg-[#050505] text-white">
                <Loader2 size={18} className="animate-spin shrink-0" />
                <div className="text-left">
                  <p className="text-[14px] font-semibold uppercase tracking-wider">
                    {phase === 'connecting' ? `Opening ${selectedWallet}…` : 'Approve signature in your wallet…'}
                  </p>
                  {connectedAddress && (
                    <p className="text-[12px] text-zinc-500 mt-0.5">{shortAddress(connectedAddress)}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {phase === 'idle' && (
            <div className="w-full space-y-3">
              {wallets.map((w: any) => {
                const icon = WALLET_ICONS[w.name] ?? '';
                return (
                  <div key={w.key} className="rounded-[3px] border border-zinc-800/50 p-2 bg-[#0a0a0a]">
                    <button
                      type="button"
                      onClick={() => handleConnect(w.key)}
                      disabled={!w.isInstalled}
                      className={`w-full flex items-center gap-3 px-5 py-4 rounded-[3px] border transition-colors ${
                        w.isInstalled
                          ? 'border-zinc-700 bg-[#050505] hover:bg-white/5 text-white'
                          : 'border-zinc-900 bg-[#050505] text-zinc-600 cursor-not-allowed'
                      }`}
                    >
                      <span className="flex items-center justify-center w-5 h-5 shrink-0">
                        {icon ? <img src={icon} alt={w.name} className="h-5 w-5" /> : <Wallet size={18} />}
                      </span>
                      <span className="text-[15px] font-semibold uppercase tracking-wider flex-1 text-left">{w.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                        {w.isInstalled ? 'Connect' : 'Not installed'}
                      </span>
                    </button>
                  </div>
                );
              })}

              {installed.length === 0 && wallets.length > 0 && (
                <p className="text-center text-[12px] text-zinc-600 pt-2">
                  No Solana wallet detected. Install Phantom, Solflare, or Backpack to continue.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-[11px] leading-relaxed text-zinc-700 max-w-sm">
          AES-256-GCM · ed25519 wallet signatures · server never sees your key material
        </p>
      </div>
    </div>
  );
}
