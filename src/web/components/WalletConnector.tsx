import React, { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Wallet, Check, Loader2, AlertCircle } from 'lucide-react';
import { clearAuth, fetchChallenge, isAuthenticated, notifyAuthChanged, setToken, setWalletAddress, walletLogin } from '../lib/auth';
import { VAULT_KEY_MESSAGE, deriveVaultPassphrase } from '../lib/vault-key';

interface Props { onConnect: () => void; }

export const WalletConnector: React.FC<Props> = ({ onConnect }) => {
  const { wallet, connect, connected: ctxConnected, connecting, publicKey: ctxPublicKey, disconnect, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const [adapterConnected, setAdapterConnected] = useState(false);
  useEffect(() => {
    const adapter = wallet?.adapter;
    if (!adapter) { setAdapterConnected(false); return; }
    setAdapterConnected(!!adapter.connected);
    const onC = () => setAdapterConnected(true); const onD = () => setAdapterConnected(false);
    adapter.on('connect', onC); adapter.on('disconnect', onD);
    return () => { adapter.off('connect', onC); adapter.off('disconnect', onD); };
  }, [wallet]);

  const connected = ctxConnected || adapterConnected;
  const publicKey = ctxPublicKey ?? wallet?.adapter?.publicKey ?? null;
  const [phase, setPhase] = useState<'idle' | 'signing' | 'authenticating' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const advancedRef = useRef(false);

  useEffect(() => { if (isAuthenticated() && connected && !advancedRef.current) { advancedRef.current = true; setPhase('done'); onConnect(); } }, []);
  useEffect(() => { if (wallet && !connected && !connecting && phase === 'idle') { connect().catch((err: unknown) => { const msg = err instanceof Error ? err.message : String(err); setErrorMsg(msg || 'Failed to connect wallet'); setPhase('error'); }); } }, [wallet, connected, connecting, connect, phase]);

  useEffect(() => {
    if (!connected || !publicKey || phase !== 'idle') return;
    if (isAuthenticated()) { if (!advancedRef.current) { advancedRef.current = true; setPhase('done'); onConnect(); } return; }
    setPhase('signing');
    (async () => {
      try {
        const adapterSign = (wallet?.adapter as { signMessage?: (m: Uint8Array) => Promise<Uint8Array> } | undefined)?.signMessage?.bind(wallet?.adapter);
        const signFn = adapterSign ?? signMessage;
        if (!signFn) throw new Error('Wallet does not support message signing.');
        const { challenge: ch } = await fetchChallenge();
        const sig = await signFn(new TextEncoder().encode(ch));
        const keySig = await signFn(new TextEncoder().encode(VAULT_KEY_MESSAGE));
        const passphrase = await deriveVaultPassphrase(keySig);
        setPhase('authenticating');
        const { token, userId } = await walletLogin(publicKey.toBase58(), sig, ch, passphrase);
        setToken(token); setWalletAddress(userId); notifyAuthChanged();
        advancedRef.current = true; setPhase('done'); onConnect();
      } catch (err: unknown) { const msg = err instanceof Error ? err.message : 'Login failed'; setErrorMsg(msg); setPhase('error'); }
    })();
  }, [connected, publicKey]);

  const retry = () => { clearAuth(); disconnect().catch(() => {}); advancedRef.current = false; setErrorMsg(''); setPhase('idle'); };
  const shortAddr = publicKey ? `${publicKey.toBase58().slice(0, 4)}\u2026${publicKey.toBase58().slice(-4)}` : '';

  if (phase === 'error') return (
    <div className="w-full space-y-3">
      <div className="px-4 py-3 rounded-xl bg-red-950/40 border border-red-900/60 flex items-start gap-3"><AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" /><p className="text-[13px] text-red-300 leading-relaxed break-words text-left">{errorMsg}</p></div>
      <button type="button" onClick={retry} className="w-full py-2 rounded-xl border border-[#243365] text-[13px] text-[#a8b3d8] hover:text-white hover:bg-white/5 transition-colors">Try Again</button>
    </div>
  );
  if (phase === 'done') return (
    <div className="rounded-xl border border-[#243365]/50 p-2 bg-[#131c39]">
      <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-emerald-900/60 bg-emerald-950/20 text-emerald-300"><Check size={18} className="text-emerald-400 shrink-0" /><span className="text-[15px] font-semibold uppercase tracking-wider">{shortAddr}</span></div>
    </div>
  );
  if (phase === 'signing' || phase === 'authenticating') {
    const label = phase === 'signing' ? 'Approve signature in your wallet\u2026' : 'Unlocking vault\u2026';
    return (
      <div className="rounded-xl border border-[#243365]/50 p-2 bg-[#131c39]">
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-[#243365] bg-[#0e1631] text-white">
          <Loader2 size={18} className="animate-spin shrink-0" />
          <div className="text-left"><p className="text-[14px] font-semibold uppercase tracking-wider">{label}</p><p className="text-[12px] text-[#8a96c2] mt-0.5">{shortAddr || 'Waiting for wallet'}</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="rounded-xl border border-[#243365]/50 p-2 bg-[#131c39]">
        <button type="button" onClick={() => setVisible(true)} disabled={connecting} className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border border-[#2e4585] bg-[#0e1631] hover:bg-white/5 text-white disabled:opacity-70 disabled:cursor-wait transition-colors">
          <span className="flex items-center justify-center w-5 h-5">{connecting ? <Loader2 size={18} className="animate-spin" /> : <Wallet size={18} />}</span>
          <span className="text-[15px] font-semibold uppercase tracking-wider">{connecting ? 'Connecting\u2026' : 'Connect Wallet'}</span>
        </button>
      </div>
      {connecting && <button type="button" onClick={retry} className="w-full text-center py-1 text-[11px] text-[#5e6a91] hover:text-white transition-colors">Cancel</button>}
      <p className="text-center text-[11px] text-[#3e4a72]">Phantom \xb7 Solflare \xb7 Backpack \xb7 OKX</p>
    </div>
  );
};
