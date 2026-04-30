import React, { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Wallet, Check, Loader2, AlertCircle } from 'lucide-react';
import {
  clearAuth,
  fetchChallenge,
  isAuthenticated,
  notifyAuthChanged,
  setToken,
  setWalletAddress,
  walletLogin,
} from '../lib/auth';
import { VAULT_KEY_MESSAGE, deriveVaultPassphrase } from '../lib/vault-key';

interface Props {
  onConnect: () => void;
}

type Phase = 'idle' | 'signing' | 'authenticating' | 'done' | 'error';

export const WalletConnector: React.FC<Props> = ({ onConnect }) => {
  const { wallet, connect, connected: ctxConnected, connecting, publicKey: ctxPublicKey, disconnect, signMessage } = useWallet();
  const { setVisible } = useWalletModal();

  // Fallback for the WalletProvider event-listener race: the adapter is
  // sometimes connected before the React context catches up.
  const [adapterConnected, setAdapterConnected] = useState(false);
  useEffect(() => {
    const adapter = wallet?.adapter;
    if (!adapter) { setAdapterConnected(false); return; }
    setAdapterConnected(!!adapter.connected);
    const onConnectEvt = () => setAdapterConnected(true);
    const onDisconnectEvt = () => setAdapterConnected(false);
    adapter.on('connect', onConnectEvt);
    adapter.on('disconnect', onDisconnectEvt);
    return () => {
      adapter.off('connect', onConnectEvt);
      adapter.off('disconnect', onDisconnectEvt);
    };
  }, [wallet]);

  const connected = ctxConnected || adapterConnected;
  const publicKey = ctxPublicKey ?? wallet?.adapter?.publicKey ?? null;

  const [phase, setPhase]       = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const advancedRef             = useRef(false);

  useEffect(() => {
    if (isAuthenticated() && connected && !advancedRef.current) {
      advancedRef.current = true;
      setPhase('done');
      onConnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wallet && !connected && !connecting && phase === 'idle') {
      connect().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg || 'Failed to connect wallet');
        setPhase('error');
      });
    }
  }, [wallet, connected, connecting, connect, phase]);

  // Single-shot flow: connected → sign challenge + derivation message → login.
  useEffect(() => {
    if (!connected || !publicKey || phase !== 'idle') return;
    if (isAuthenticated()) {
      if (!advancedRef.current) { advancedRef.current = true; setPhase('done'); onConnect(); }
      return;
    }

    setPhase('signing');
    (async () => {
      try {
        // Use adapter.signMessage to bypass the stale "connected" guard.
        const adapterSign = (wallet?.adapter as { signMessage?: (m: Uint8Array) => Promise<Uint8Array> } | undefined)?.signMessage?.bind(wallet?.adapter);
        const signFn = adapterSign ?? signMessage;
        if (!signFn) throw new Error('Wallet does not support message signing.');

        // 1. Anti-replay: sign the server's random challenge.
        const { challenge: ch } = await fetchChallenge();
        const sig = await signFn(new TextEncoder().encode(ch));

        // 2. Vault key: sign a fixed message → hash → AES key.
        //    ed25519 is deterministic, so this is the same value every session
        //    for the same wallet, but unguessable without the private key.
        const keySig = await signFn(new TextEncoder().encode(VAULT_KEY_MESSAGE));
        const passphrase = await deriveVaultPassphrase(keySig);

        setPhase('authenticating');
        const { token, userId } = await walletLogin(
          publicKey.toBase58(),
          sig,
          ch,
          passphrase,
        );
        setToken(token);
        setWalletAddress(userId);
        notifyAuthChanged();
        advancedRef.current = true;
        setPhase('done');
        onConnect();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Login failed';
        setErrorMsg(msg);
        setPhase('error');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey]);

  function retry() {
    clearAuth();
    disconnect().catch(() => {});
    advancedRef.current = false;
    setErrorMsg('');
    setPhase('idle');
  }

  const shortAddr = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : '';

  // ── error ────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="w-full space-y-3">
        <div className="px-4 py-3 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-start gap-3">
          <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[13px] text-rose-300 leading-relaxed break-words text-left">{errorMsg}</p>
        </div>
        <button
          type="button"
          onClick={retry}
          className="w-full py-2 rounded-xl border border-[#1c2238] text-[13px] text-zinc-400 hover:text-white hover:bg-[#11162a] transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── done ─────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="rounded-2xl border border-[#1c2238] p-2 bg-[#0a0d1a]/60">
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-emerald-900/60 bg-[#0c1f17] text-emerald-300">
          <Check size={18} className="text-emerald-400 shrink-0" />
          <span className="text-[15px] font-medium tracking-tight">{shortAddr}</span>
        </div>
      </div>
    );
  }

  // ── signing / authenticating ─────────────────────────────────────────────
  if (phase === 'signing' || phase === 'authenticating') {
    const label =
      phase === 'signing'      ? 'Approve signature in your wallet…'
                               : 'Unlocking vault…';
    return (
      <div className="rounded-2xl border border-[#1c2238] p-2 bg-[#0a0d1a]/60">
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-[#222a48] bg-[#0c1025] text-zinc-200">
          <Loader2 size={18} className="animate-spin shrink-0 text-[#5b8cff]" />
          <div className="text-left">
            <p className="text-[14px] font-medium text-white">{label}</p>
            <p className="text-[12px] text-zinc-500 mt-0.5">{shortAddr || 'Waiting for wallet'}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── idle / select wallet ─────────────────────────────────────────────────
  const busy = connecting;
  return (
    <div className="w-full space-y-3">
      <div className="rounded-2xl border border-[#1c2238] p-2 bg-[#0a0d1a]/60">
        <button
          type="button"
          onClick={() => setVisible(true)}
          disabled={busy}
          className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border border-[#222a48] bg-[#11162a] hover:bg-[#161c36] text-white disabled:opacity-70 disabled:cursor-wait transition-colors"
        >
          <span className="flex items-center justify-center w-5 h-5">
            {busy ? <Loader2 size={18} className="animate-spin text-zinc-300" /> : <Wallet size={18} className="text-zinc-300" />}
          </span>
          <span className="text-[15px] font-medium tracking-tight">
            {busy ? 'Connecting…' : 'Connect Wallet'}
          </span>
        </button>
      </div>
      {busy && (
        <button
          type="button"
          onClick={retry}
          className="w-full text-center py-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      )}
      <p className="text-center text-[11px] text-zinc-600">
        Phantom · Solflare · Backpack · OKX
      </p>
    </div>
  );
};
