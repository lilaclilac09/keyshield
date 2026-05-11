/**
 * Path A vault session — orchestrates client-side crypto + CF Worker sync.
 *
 * Lives in module state. Reset on logout. Bootstrapped by the WebAuthn
 * passkey ceremonies in `auth.ts` once they extract a PRF output.
 *
 * Flow:
 *   register passkey → enrollVault(prf) → derive key+id → CF /auth/register
 *   login w/ passkey → unlockVault(prf, assertion) → derive + CF /auth/exchange + pull
 *   add/remove key   → mutateVault(...) → encrypt + CF PUT /vault/:id
 *   call upstream    → getDecryptedKey(upstream) → returns raw key string
 */

import {
  decryptVault,
  deriveMasterKey,
  deriveVaultId,
  emptyVault,
  encryptVault,
  type VaultEntry,
  type VaultPlaintext,
} from './vault';
import { makeBearerHolder, type BearerHolder } from './sync-auth';
import { makeHttpSyncBackend, SyncAuthError, type SyncBackend } from './sync';

export const SYNC_URL: string = (() => {
  // vite's `define` replaces the literal `process.env.KEYSHIELD_SYNC_URL`
  // at build time. Local destructure would not be replaced.
  if (typeof process !== 'undefined' && process.env.KEYSHIELD_SYNC_URL) {
    return process.env.KEYSHIELD_SYNC_URL;
  }
  return 'http://localhost:8787';
})();

interface SessionState {
  vaultId: string;
  masterKey: CryptoKey;
  bearer: BearerHolder;
  sync: SyncBackend;
  plaintext: VaultPlaintext;
}

let _state: SessionState | null = null;

export function isVaultUnlocked(): boolean {
  return _state !== null;
}

export function lockVault(): void {
  _state?.bearer.clear();
  _state = null;
}

/** First-run on a device: register vault with CF Worker (no JWT yet). */
export async function enrollVault(
  prfOutput: ArrayBuffer,
  attestation: unknown,
  expectedChallenge: string,
): Promise<{ vaultId: string }> {
  const vaultId = await deriveVaultId(prfOutput);
  const res = await fetch(`${SYNC_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vaultId, attestation, expectedChallenge }),
  });
  // 409 = already registered = OK (cross-device race or re-enrollment)
  if (!res.ok && res.status !== 409) {
    const err = await res.json().catch(() => ({ error: `register failed (${res.status})` }));
    throw new Error((err as { error?: string }).error ?? `register failed (${res.status})`);
  }
  return { vaultId };
}

/** Unlock: exchange WebAuthn assertion for a JWT, pull cipher, decrypt. */
export async function unlockVault(
  prfOutput: ArrayBuffer,
  assertion: unknown,
): Promise<{ vaultId: string; entryCount: number }> {
  const vaultId = await deriveVaultId(prfOutput);
  const masterKey = await deriveMasterKey(prfOutput);

  const exchangeRes = await fetch(`${SYNC_URL}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vaultId, assertion }),
  });
  if (!exchangeRes.ok) {
    const err = await exchangeRes.json().catch(() => ({ error: `exchange failed (${exchangeRes.status})` }));
    throw new Error((err as { error?: string }).error ?? `exchange failed (${exchangeRes.status})`);
  }
  const { token, expiresAt } = await exchangeRes.json() as { token: string; expiresAt: number };

  const bearer = makeBearerHolder();
  bearer.set(token, expiresAt);
  const sync = makeHttpSyncBackend(SYNC_URL);

  const cipher = await sync.pull(vaultId, () => bearer.get());
  const plaintext = cipher ? await decryptVault(masterKey, cipher) : emptyVault();

  _state = { vaultId, masterKey, bearer, sync, plaintext };
  return { vaultId, entryCount: Object.keys(plaintext.entries).length };
}

/** Get a fresh challenge from CF Worker for the unlock ceremony. */
export async function getCfChallenge(prfOutput: ArrayBuffer): Promise<string> {
  const vaultId = await deriveVaultId(prfOutput);
  const res = await fetch(`${SYNC_URL}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vaultId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `challenge failed (${res.status})` }));
    throw new Error((err as { error?: string }).error ?? `challenge failed (${res.status})`);
  }
  const { challenge } = await res.json() as { challenge: string };
  return challenge;
}

export function listEntries(): VaultEntry[] {
  if (!_state) throw new Error('vault locked');
  return Object.values(_state.plaintext.entries);
}

export function getDecryptedKey(upstream: string): string | null {
  return _state?.plaintext.entries[upstream]?.apiKey ?? null;
}

export async function addEntry(upstream: string, apiKey: string): Promise<void> {
  await mutate((p) => {
    p.entries[upstream] = { upstream, apiKey, addedAt: Date.now() };
  });
}

export async function removeEntry(upstream: string): Promise<void> {
  await mutate((p) => {
    delete p.entries[upstream];
  });
}

async function mutate(fn: (p: VaultPlaintext) => void): Promise<void> {
  if (!_state) throw new Error('vault locked');
  const next: VaultPlaintext = {
    entries: { ..._state.plaintext.entries },
    updatedAt: Date.now(),
  };
  fn(next);
  const cipher = await encryptVault(_state.masterKey, next);
  const result = await _state.sync.push(_state.vaultId, cipher, () => _state!.bearer.get());
  if (result === 'conflict') {
    // Last-write-wins for v1 — pull, take server's, surface to user via re-render.
    // Why: full conflict-merge UX is out of scope for hackathon; the CAS still
    // protects against silent overwrite (we threw, caller can retry).
    throw new Error('vault conflict — another device wrote first; reload to refresh');
  }
  _state.plaintext = next;
}

export class VaultLockedError extends Error {
  constructor() { super('vault locked — unlock with passkey first'); }
}

export { SyncAuthError };
