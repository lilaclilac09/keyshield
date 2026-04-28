/**
 * Owner-wallet adapter hook.
 *
 * The popup relies on a Solana wallet (OKX, Phantom, Backpack, ...) to
 * sign the `grant_agent_access` / `revoke_agent_access` /
 * `revoke_all_agents` transactions that SessionManager builds.
 *
 * We don't ship the full @solana/wallet-adapter-react UI inside the
 * popup yet — it's heavy and the extension already has its own
 * connect-wallet flow on the page side. So this hook does the minimum:
 *   - detects window.solana / OKX / Phantom / Backpack injection
 *   - exposes connect / disconnect / signAndSendTx
 *
 * If you want a richer wallet picker later, swap this for
 * `useWallet` from @solana/wallet-adapter-react and wrap App in
 * <ConnectionProvider> + <WalletProvider>.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionSignature,
} from '@solana/web3.js';

/** Subset of the Solana injected-wallet contract we depend on. */
export interface InjectedWallet {
  publicKey: PublicKey | null;
  isConnected: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: <T extends Transaction>(tx: T) => Promise<T>;
}

export interface OwnerWalletState {
  publicKey: PublicKey | null;
  walletName: 'OKX' | 'Phantom' | 'Backpack' | 'unknown' | null;
  isConnecting: boolean;
  error: string | null;
}

/**
 * Pick whichever Solana-injecting wallet is available, preferring OKX
 * (since that's the one wired into our existing frontend auth flow).
 */
function detectWallet(): { name: OwnerWalletState['walletName']; api: InjectedWallet } | null {
  const w = globalThis as any;
  if (w.okxwallet?.solana) return { name: 'OKX', api: w.okxwallet.solana };
  if (w.backpack?.isBackpack) return { name: 'Backpack', api: w.backpack };
  if (w.phantom?.solana) return { name: 'Phantom', api: w.phantom.solana };
  if (w.solana?.isPhantom) return { name: 'Phantom', api: w.solana };
  if (w.solana) return { name: 'unknown', api: w.solana };
  return null;
}

export function useOwnerWallet(connection: Connection) {
  const [state, setState] = useState<OwnerWalletState>({
    publicKey: null,
    walletName: null,
    isConnecting: false,
    error: null,
  });

  // Auto-attempt a silent re-connect on mount if the wallet remembers us.
  useEffect(() => {
    const found = detectWallet();
    if (!found) return;
    setState((s) => ({ ...s, walletName: found.name }));
    found.api
      .connect({ onlyIfTrusted: true })
      .then((res) => {
        setState((s) => ({ ...s, publicKey: res.publicKey }));
      })
      .catch(() => {
        // user has not previously trusted — that's fine, stay disconnected
      });
  }, []);

  const connect = useCallback(async () => {
    const found = detectWallet();
    if (!found) {
      setState((s) => ({
        ...s,
        error: 'No Solana wallet detected. Install OKX, Phantom, or Backpack.',
      }));
      return;
    }
    setState((s) => ({ ...s, isConnecting: true, error: null, walletName: found.name }));
    try {
      const res = await found.api.connect();
      setState((s) => ({
        ...s,
        publicKey: res.publicKey,
        isConnecting: false,
      }));
    } catch (e: any) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: e?.message ?? 'Connect failed',
      }));
    }
  }, []);

  const disconnect = useCallback(async () => {
    const found = detectWallet();
    if (found?.api.disconnect) {
      try {
        await found.api.disconnect();
      } catch {
        /* swallow — UI just goes back to the connect state */
      }
    }
    setState({
      publicKey: null,
      walletName: null,
      isConnecting: false,
      error: null,
    });
  }, []);

  /**
   * Have the connected wallet sign + broadcast the given Transaction.
   * Returns the signature once the network confirms.
   */
  const signAndSend = useCallback(
    async (tx: Transaction): Promise<TransactionSignature> => {
      const found = detectWallet();
      if (!found || !state.publicKey) {
        throw new Error('Wallet not connected');
      }
      if (!tx.feePayer) tx.feePayer = state.publicKey;
      if (!tx.recentBlockhash) {
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
      }
      const signed = await found.api.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature, 'confirmed');
      return signature;
    },
    [connection, state.publicKey],
  );

  return { state, connect, disconnect, signAndSend };
}
