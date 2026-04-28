/**
 * Tests for the owner-wallet adapter hook.
 *
 * Pins:
 *   - detection priority (OKX > Backpack > Phantom > generic)
 *   - silent reconnect on mount via { onlyIfTrusted: true }
 *   - connect() success / failure / no-wallet paths
 *   - disconnect() clears state and tolerates wallet errors
 *   - signAndSend() fills feePayer + recentBlockhash, signs, sends, confirms
 *   - signAndSend() throws when not connected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { useOwnerWallet } from './useOwnerWallet';

// ─── helpers ──────────────────────────────────────────────────────────────

function fakePubkey(byte: number): PublicKey {
  return new PublicKey(new Uint8Array(32).fill(byte));
}

interface InjectedWalletOpts {
  /** What `.connect()` resolves with (defaults to a fake pubkey). */
  pubkey?: PublicKey;
  /** Make `.connect({onlyIfTrusted}: true)` reject (untrusted user). */
  rejectSilent?: boolean;
  /** Make explicit `.connect()` reject (user clicked cancel). */
  rejectExplicit?: boolean;
  /** Make `.disconnect()` throw. */
  disconnectThrows?: boolean;
}

function makeWallet(opts: InjectedWalletOpts = {}) {
  const pk = opts.pubkey ?? fakePubkey(0xab);
  return {
    publicKey: null as PublicKey | null,
    isConnected: false,
    connect: vi.fn(async (params?: { onlyIfTrusted?: boolean }) => {
      if (params?.onlyIfTrusted && opts.rejectSilent) {
        throw new Error('not trusted');
      }
      if (!params?.onlyIfTrusted && opts.rejectExplicit) {
        throw new Error('user rejected');
      }
      return { publicKey: pk };
    }),
    disconnect: vi.fn(async () => {
      if (opts.disconnectThrows) throw new Error('disconnect failed');
    }),
    signTransaction: vi.fn(async (tx: Transaction) => {
      // Return an object that satisfies the hook's `signed.serialize()`
      // call without going through the real legacy-Message encoder
      // (which needs a populated `instructions` array — too much for
      // this unit test).
      return Object.assign(Object.create(tx), {
        serialize: () => new Uint8Array([1, 2, 3, 4]),
      }) as Transaction;
    }),
  };
}

function fakeConnection() {
  return {
    getLatestBlockhash: vi.fn(async () => ({
      blockhash: 'A'.repeat(32),
      lastValidBlockHeight: 1,
    })),
    sendRawTransaction: vi.fn(async () => 'sig-deadbeef'),
    confirmTransaction: vi.fn(async () => ({})),
  } as unknown as Connection;
}

beforeEach(() => {
  // Wipe any wallet injection between tests.
  delete (globalThis as any).okxwallet;
  delete (globalThis as any).backpack;
  delete (globalThis as any).phantom;
  delete (globalThis as any).solana;
});

afterEach(() => {
  delete (globalThis as any).okxwallet;
  delete (globalThis as any).backpack;
  delete (globalThis as any).phantom;
  delete (globalThis as any).solana;
});

// ─── 1. detection priority ────────────────────────────────────────────────

describe('useOwnerWallet — detection priority', () => {
  it('prefers OKX when okxwallet.solana is injected', async () => {
    const w = makeWallet();
    (globalThis as any).okxwallet = { solana: w };
    (globalThis as any).phantom = { solana: makeWallet() };

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await waitFor(() => expect(result.current.state.walletName).toBe('OKX'));
  });

  it('falls back to Backpack when OKX absent', async () => {
    (globalThis as any).backpack = { ...makeWallet(), isBackpack: true };

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await waitFor(() => expect(result.current.state.walletName).toBe('Backpack'));
  });

  it('falls back to Phantom when only phantom.solana is injected', async () => {
    (globalThis as any).phantom = { solana: makeWallet() };

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await waitFor(() => expect(result.current.state.walletName).toBe('Phantom'));
  });

  it('marks generic injected window.solana as "unknown"', async () => {
    (globalThis as any).solana = makeWallet();

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await waitFor(() => expect(result.current.state.walletName).toBe('unknown'));
  });

  it('detects nothing on a clean window', async () => {
    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    // Wait one tick so the effect has a chance to run.
    await Promise.resolve();
    expect(result.current.state.walletName).toBeNull();
    expect(result.current.state.publicKey).toBeNull();
  });
});

// ─── 2. silent reconnect on mount ─────────────────────────────────────────

describe('useOwnerWallet — silent reconnect on mount', () => {
  it('connects automatically when the user previously trusted', async () => {
    const pk = fakePubkey(0x10);
    const w = makeWallet({ pubkey: pk });
    (globalThis as any).okxwallet = { solana: w };

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await waitFor(() => {
      expect(result.current.state.publicKey?.equals(pk)).toBe(true);
    });
    // The mount-time call uses onlyIfTrusted=true.
    expect(w.connect).toHaveBeenCalledWith({ onlyIfTrusted: true });
  });

  it('stays disconnected when silent connect rejects', async () => {
    const w = makeWallet({ rejectSilent: true });
    (globalThis as any).okxwallet = { solana: w };

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    // Wait for the mount effect to run + reject.
    await waitFor(() =>
      expect(result.current.state.walletName).toBe('OKX'),
    );
    // publicKey stays null — the user has to click Connect.
    expect(result.current.state.publicKey).toBeNull();
    expect(result.current.state.error).toBeNull();
  });
});

// ─── 3. connect() ─────────────────────────────────────────────────────────

describe('useOwnerWallet — connect()', () => {
  it('reports an error when no wallet is installed', async () => {
    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.state.error).toMatch(/no solana wallet/i);
    expect(result.current.state.publicKey).toBeNull();
  });

  it('sets publicKey on a successful connect', async () => {
    const pk = fakePubkey(0x42);
    const w = makeWallet({ pubkey: pk, rejectSilent: true });
    (globalThis as any).okxwallet = { solana: w };

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    // Skip silent-reconnect (rejectSilent).
    await waitFor(() => expect(result.current.state.walletName).toBe('OKX'));

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.state.publicKey?.equals(pk)).toBe(true);
    expect(result.current.state.isConnecting).toBe(false);
  });

  it('surfaces a user-rejected connect as an error', async () => {
    const w = makeWallet({ rejectSilent: true, rejectExplicit: true });
    (globalThis as any).okxwallet = { solana: w };

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await waitFor(() => expect(result.current.state.walletName).toBe('OKX'));

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.state.error).toMatch(/user rejected/i);
    expect(result.current.state.publicKey).toBeNull();
    expect(result.current.state.isConnecting).toBe(false);
  });
});

// ─── 4. disconnect() ──────────────────────────────────────────────────────

describe('useOwnerWallet — disconnect()', () => {
  it('clears state on disconnect', async () => {
    const w = makeWallet({ pubkey: fakePubkey(0x99) });
    (globalThis as any).okxwallet = { solana: w };

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await waitFor(() => expect(result.current.state.publicKey).not.toBeNull());

    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.state.publicKey).toBeNull();
    expect(result.current.state.walletName).toBeNull();
    expect(w.disconnect).toHaveBeenCalled();
  });

  it("doesn't crash when the wallet's disconnect throws", async () => {
    const w = makeWallet({
      pubkey: fakePubkey(0x99),
      disconnectThrows: true,
    });
    (globalThis as any).okxwallet = { solana: w };

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await waitFor(() => expect(result.current.state.publicKey).not.toBeNull());

    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.state.publicKey).toBeNull();
  });
});

// ─── 5. signAndSend() ─────────────────────────────────────────────────────

describe('useOwnerWallet — signAndSend()', () => {
  it('fills feePayer + recentBlockhash, signs, broadcasts, confirms', async () => {
    const pk = fakePubkey(0x77);
    const w = makeWallet({ pubkey: pk });
    (globalThis as any).okxwallet = { solana: w };
    const conn = fakeConnection();

    const { result } = renderHook(() => useOwnerWallet(conn));
    await waitFor(() => expect(result.current.state.publicKey).not.toBeNull());

    const tx = new Transaction();
    let sig: string | undefined;
    await act(async () => {
      sig = await result.current.signAndSend(tx);
    });
    expect(sig).toBe('sig-deadbeef');
    expect(tx.feePayer?.equals(pk)).toBe(true);
    expect(tx.recentBlockhash).toMatch(/^A+$/);
    expect(w.signTransaction).toHaveBeenCalledOnce();
    expect((conn as any).sendRawTransaction).toHaveBeenCalledOnce();
    expect((conn as any).confirmTransaction).toHaveBeenCalledWith(
      'sig-deadbeef',
      'confirmed',
    );
  });

  it('respects an already-set feePayer', async () => {
    const ownerPk = fakePubkey(0x77);
    const otherPk = fakePubkey(0x88);
    const w = makeWallet({ pubkey: ownerPk });
    (globalThis as any).okxwallet = { solana: w };

    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await waitFor(() => expect(result.current.state.publicKey).not.toBeNull());

    const tx = new Transaction();
    tx.feePayer = otherPk;
    await act(async () => {
      await result.current.signAndSend(tx);
    });
    expect(tx.feePayer.equals(otherPk)).toBe(true);
  });

  it('throws when no wallet is connected', async () => {
    const { result } = renderHook(() => useOwnerWallet(fakeConnection()));
    await Promise.resolve();
    await expect(result.current.signAndSend(new Transaction())).rejects.toThrow(
      /not connected/i,
    );
  });
});
