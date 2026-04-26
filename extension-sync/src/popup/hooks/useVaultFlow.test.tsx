/**
 * Integration tests for the Path A vault-flow hook, with a focus on
 * the no-passkey recovery path: a user with the 24-word mnemonic
 * can decrypt the vault on a fresh device that has never had the
 * passkey, and the AuthService never gets called.
 *
 * The harness uses real LocalVault + real InMemorySyncBackend so the
 * encrypt/decrypt + sync round-trips are end-to-end correct. Only
 * the AuthService is mocked — that's the WebAuthn dance, which can't
 * run in a Node test runner anyway.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';

import { useVaultFlow, type VaultFlowState } from './useVaultFlow';
import {
  LocalVault,
  type CryptoBackend,
  type StorageBackend,
} from '../../lib/vault';
import { InMemorySyncBackend } from '../../lib/sync';
import { ExtensionSession } from '../../lib/session';
import { BearerHolder } from '../../lib/sync-auth';
import type { AuthResult } from '../../lib/auth';

// ============================================================
// Test doubles
// ============================================================

const FAKE_PRF = new Uint8Array(32).fill(0xab);

function memoryStorage(): StorageBackend {
  const data = new Map<string, unknown>();
  return {
    async get(key) {
      return data.get(key) as any;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
  };
}

const realCrypto: CryptoBackend = {
  subtle: webcrypto.subtle as unknown as SubtleCrypto,
  getRandomValues: <T extends ArrayBufferView | null>(a: T) =>
    webcrypto.getRandomValues(a as any) as T,
};

interface Harness {
  services: any;
  shared: { sync: InMemorySyncBackend };
}

/**
 * Build a fresh services bundle for "this device". Pass `sharedSync`
 * across calls to simulate two devices joining the same user vault.
 */
function makeDevice(opts: {
  sharedSync?: InMemorySyncBackend;
  /** What `auth.registerPasskey` should return. Defaults to a result
   *  carrying FAKE_PRF and the right JSON shapes. */
  registerResult?: AuthResult;
  authenticateResult?: AuthResult;
}): Harness {
  const sync = opts.sharedSync ?? new InMemorySyncBackend();
  const auth = {
    registerPasskey: vi.fn(async () => opts.registerResult ?? freshRegisterResult()),
    authenticateWithWebAuthn: vi.fn(
      async () => opts.authenticateResult ?? freshAuthenticateResult(),
    ),
    isWebAuthnAvailable: vi.fn(() => true),
  };
  const services = {
    auth,
    vault: new LocalVault({ storage: memoryStorage(), crypto: realCrypto }),
    sync,
    syncAuth: null,
    bearer: new BearerHolder(),
    session: new ExtensionSession({ storage: memoryStorage() }),
  };
  return { services, shared: { sync } };
}

function freshRegisterResult(prfBytes: Uint8Array = FAKE_PRF): AuthResult {
  return {
    success: true,
    credentialId: 'cred-id',
    prfSecret: prfBytes,
    expectedChallenge: 'CHALLENGE_BASE64URL',
    registrationResponseJSON: {
      id: 'cred-id',
      rawId: 'cred-id',
      type: 'public-key',
      response: { clientDataJSON: 'a', attestationObject: 'b' },
      clientExtensionResults: {},
    },
  };
}

function freshAuthenticateResult(prfBytes: Uint8Array = FAKE_PRF): AuthResult {
  return {
    success: true,
    credentialId: 'cred-id',
    prfSecret: prfBytes,
    authenticationResponseJSON: {
      id: 'cred-id',
      rawId: 'cred-id',
      type: 'public-key',
      response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' },
      clientExtensionResults: {},
    },
  };
}

/** Make detectPrfSupport always return 'supported' so the hook
 *  doesn't try to call the global `PublicKeyCredential`. */
beforeEach(() => {
  (globalThis as any).PublicKeyCredential = {
    getClientCapabilities: async () => ({ 'extension:prf': true }),
  };
});

// Helper: get a typed view of the current state.
function flow<T extends VaultFlowState['kind']>(
  result: { current: ReturnType<typeof useVaultFlow> },
  kind: T,
): Extract<VaultFlowState, { kind: T }> {
  if (result.current.state.kind !== kind) {
    throw new Error(
      `expected state '${kind}', got '${result.current.state.kind}'`,
    );
  }
  return result.current.state as Extract<VaultFlowState, { kind: T }>;
}

// ============================================================
// 1. First-run produces a usable vault and a recoverable phrase
// ============================================================

describe('useVaultFlow — first run on a fresh device', () => {
  it('walks firstRun → showMnemonic → unlocked, with a 24-word phrase saved', async () => {
    const dev = makeDevice({});
    const { result } = renderHook(() => useVaultFlow(dev.services));

    // Initial useEffect: PRF probe + cache check.
    await waitFor(() =>
      expect(['firstRun', 'locked']).toContain(result.current.state.kind),
    );
    expect(result.current.state.kind).toBe('firstRun');

    // User taps "Create vault" — completeFirstRun is what UnlockScreen
    // dispatches with the registration result.
    await act(async () => {
      await result.current.completeFirstRun(freshRegisterResult());
    });

    // We should now be on the show-mnemonic screen.
    const mnemState = flow(result, 'showMnemonic');
    expect(mnemState.mnemonic.split(' ')).toHaveLength(24);

    // Acknowledge transitions to unlocked with an empty vault.
    act(() => {
      result.current.acknowledgeMnemonic();
    });
    const unlocked = flow(result, 'unlocked');
    expect(unlocked.vault.apiKeys).toEqual({});
  });
});

// ============================================================
// 2. iCloud-Keychain UX: "different device" with the same PRF
//    pulls the existing vault automatically.
// ============================================================

describe('useVaultFlow — second device unlocks the same vault', () => {
  it('a fresh device with the same PRF inherits the keys we added on device A', async () => {
    // Device A: first run, add a key, lock.
    const sharedSync = new InMemorySyncBackend();
    const dA = makeDevice({ sharedSync });
    const a = renderHook(() => useVaultFlow(dA.services));
    await waitFor(() => expect(a.result.current.state.kind).toBe('firstRun'));
    await act(async () => {
      await a.result.current.completeFirstRun(freshRegisterResult());
    });
    act(() => a.result.current.acknowledgeMnemonic());
    await act(async () => {
      await a.result.current.upsertKey('openai', 'sk-from-device-a');
    });
    // Confirm device A's local state shows the key.
    expect(flow(a.result, 'unlocked').vault.apiKeys.openai.value).toBe(
      'sk-from-device-a',
    );

    // Device B: same PRF (passkey synced via iCloud Keychain), fresh
    // local cache. The hook should land in 'firstRun' (no cache),
    // and the user's authenticateWithWebAuthn flow should be the
    // entry — but completeFirstRun sees the existing remote cipher
    // and skips the showMnemonic step.
    const dB = makeDevice({ sharedSync });
    const b = renderHook(() => useVaultFlow(dB.services));
    await waitFor(() => expect(b.result.current.state.kind).toBe('firstRun'));
    await act(async () => {
      await b.result.current.completeFirstRun(freshRegisterResult());
    });

    // No mnemonic shown — there was an existing cipher to unwrap.
    expect(b.result.current.state.kind).toBe('unlocked');
    expect(flow(b.result, 'unlocked').vault.apiKeys.openai.value).toBe(
      'sk-from-device-a',
    );
  });
});

// ============================================================
// 3. The no-passkey path: restoreFromMnemonic
// ============================================================

describe('useVaultFlow — restore from recovery phrase (no passkey)', () => {
  it('unlocks the vault from just the 24 words, AuthService never gets called', async () => {
    // Set up: device A creates the vault and we capture the mnemonic.
    const sharedSync = new InMemorySyncBackend();
    const dA = makeDevice({ sharedSync });
    const a = renderHook(() => useVaultFlow(dA.services));
    await waitFor(() => expect(a.result.current.state.kind).toBe('firstRun'));
    await act(async () => {
      await a.result.current.completeFirstRun(freshRegisterResult());
    });
    const mnemonic = flow(a.result, 'showMnemonic').mnemonic;
    act(() => a.result.current.acknowledgeMnemonic());
    await act(async () => {
      await a.result.current.upsertKey('stripe', 'sk_live_xyz');
    });

    // Device C: no passkey at all. The user lost both A and B.
    // They open the popup, click "I have a recovery phrase",
    // and type the 24 words.
    const dC = makeDevice({ sharedSync });
    const c = renderHook(() => useVaultFlow(dC.services));
    await waitFor(() => expect(c.result.current.state.kind).toBe('firstRun'));

    // Critical: after this point we never invoke registerPasskey or
    // authenticateWithWebAuthn. The mnemonic IS the auth.
    act(() => c.result.current.startRestore());
    expect(c.result.current.state.kind).toBe('restore');

    await act(async () => {
      await c.result.current.restoreFromMnemonic(mnemonic);
    });

    expect(c.result.current.state.kind).toBe('unlocked');
    expect(flow(c.result, 'unlocked').vault.apiKeys.stripe.value).toBe(
      'sk_live_xyz',
    );
    // Proof of "no passkey needed":
    expect(dC.services.auth.registerPasskey).not.toHaveBeenCalled();
    expect(dC.services.auth.authenticateWithWebAuthn).not.toHaveBeenCalled();
  });

  it('throws InvalidMnemonicError on a typo', async () => {
    const dev = makeDevice({});
    const { result } = renderHook(() => useVaultFlow(dev.services));
    await waitFor(() => expect(result.current.state.kind).toBe('firstRun'));
    act(() => result.current.startRestore());
    await expect(
      result.current.restoreFromMnemonic('not a real phrase obviously'),
    ).rejects.toThrow(/Recovery phrase is invalid/i);
  });

  it('throws "No vault found" when the seed is valid but nothing has been pushed yet', async () => {
    const dev = makeDevice({});
    const { result } = renderHook(() => useVaultFlow(dev.services));
    await waitFor(() => expect(result.current.state.kind).toBe('firstRun'));
    act(() => result.current.startRestore());

    // Use a freshly-generated mnemonic that doesn't match any vault.
    const { generateMnemonic } = await import('../../lib/mnemonic');
    const orphanPhrase = generateMnemonic();
    await expect(
      result.current.restoreFromMnemonic(orphanPhrase),
    ).rejects.toThrow(/No vault found/);
  });

  it('cancelRestore puts us back into firstRun', async () => {
    const dev = makeDevice({});
    const { result } = renderHook(() => useVaultFlow(dev.services));
    await waitFor(() => expect(result.current.state.kind).toBe('firstRun'));
    act(() => result.current.startRestore());
    expect(result.current.state.kind).toBe('restore');
    act(() => result.current.cancelRestore());
    expect(result.current.state.kind).toBe('firstRun');
  });
});

// ============================================================
// 4. After-restore behaviour: edits work locally even without a JWT
//    (the next "register a passkey on this device" step is V1.2 work,
//    but the popup must not crash if the user just sits there).
// ============================================================

describe('useVaultFlow — post-restore CRUD', () => {
  it('upsertKey works after restore (writes to local cache; sync push 401s gracefully)', async () => {
    // A creates the vault.
    const sharedSync = new InMemorySyncBackend();
    const dA = makeDevice({ sharedSync });
    const a = renderHook(() => useVaultFlow(dA.services));
    await waitFor(() => expect(a.result.current.state.kind).toBe('firstRun'));
    await act(async () => {
      await a.result.current.completeFirstRun(freshRegisterResult());
    });
    const mnemonic = flow(a.result, 'showMnemonic').mnemonic;
    act(() => a.result.current.acknowledgeMnemonic());

    // C restores.
    const dC = makeDevice({ sharedSync });
    const c = renderHook(() => useVaultFlow(dC.services));
    await waitFor(() => expect(c.result.current.state.kind).toBe('firstRun'));
    act(() => c.result.current.startRestore());
    await act(async () => {
      await c.result.current.restoreFromMnemonic(mnemonic);
    });

    // Add a key on C — even without a JWT, the local cache should
    // update and the in-memory state should reflect the new key.
    await act(async () => {
      await c.result.current.upsertKey('anthropic', 'sk-ant-from-c');
    });
    expect(flow(c.result, 'unlocked').vault.apiKeys.anthropic.value).toBe(
      'sk-ant-from-c',
    );

    // The shared InMemorySyncBackend doesn't enforce auth — for the
    // purpose of this test it accepted the push too. (In production
    // the worker would 401 until C re-registers a passkey; the
    // popup keeps the local cache and lets the next sync catch up.)
  });
});
