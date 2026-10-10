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
import { PROD_SYNC_URL, usePublicControlPlaneFallback } from './host-deploy';

export const SYNC_URL: string = (() => {
  // vite's `define` replaces the literal `process.env.KEYSHIELD_SYNC_URL`
  // at build time. Without CI env, bundles can still bake localhost:8787 —
  // override on the real production dashboard host so Path A unlock works.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const fromBuild =
    typeof process !== 'undefined' && process.env.KEYSHIELD_SYNC_URL
      ? process.env.KEYSHIELD_SYNC_URL
      : 'http://localhost:8787';

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (usePublicControlPlaneFallback(host, fromBuild)) {
      if (PROD_SYNC_URL) return PROD_SYNC_URL;
    }
    return fromBuild;
  }

  return fromBuild;
})();

// Why cache vaultId in localStorage: it's derived from PRF output, which we
// can only obtain from a WebAuthn ceremony (Face ID / TouchID prompt). Caching
// the non-secret derived id lets the unlock path skip the "probe ceremony"
// that exists solely to learn the vaultId before calling /auth/challenge.
// This collapses unlock from 2 prompts → 1.
const VAULT_ID_CACHE_KEY = 'ks_vault_id';

export function getCachedVaultId(): string | null {
  try { return localStorage.getItem(VAULT_ID_CACHE_KEY); } catch { return null; }
}

function setCachedVaultId(id: string): void {
  try { localStorage.setItem(VAULT_ID_CACHE_KEY, id); } catch { /* ignore quota */ }
}

export function clearCachedVaultId(): void {
  try { localStorage.removeItem(VAULT_ID_CACHE_KEY); } catch { /* ignore */ }
}

/** Wrap a fetch error so the user sees an actionable hint instead of a raw
 *  "Failed to fetch" / TypeError. CORS+netfail both surface as TypeError in
 *  the browser, and the most common cause in dev is "worker not started". */
function describeNetError(e: unknown, op: string): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof TypeError || /fetch|network/i.test(msg)) {
    return new Error(
      `Sync worker unreachable at ${SYNC_URL} (${op}). ` +
      `From the repo root:  npm install  then  npm run dev:worker  (runs wrangler on :8787).`,
    );
  }
  return e instanceof Error ? e : new Error(msg);
}

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
  // Intentionally NOT clearing the cached vaultId: it's non-secret and
  // letting the next unlock skip the probe ceremony is the whole point.
}

/** First-run on a device: register vault with CF Worker (no JWT yet). */
export async function enrollVault(
  prfOutput: ArrayBuffer,
  attestation: unknown,
  expectedChallenge: string,
): Promise<{ vaultId: string }> {
  const vaultId = await deriveVaultId(prfOutput);
  let res: Response;
  try {
    res = await fetch(`${SYNC_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId, attestation, expectedChallenge }),
      signal: AbortSignal.timeout(2500),
    });
  } catch (e) {
    throw describeNetError(e, 'register');
  }
  // 409 = already registered = OK (cross-device race or re-enrollment)
  if (!res.ok && res.status !== 409) {
    const err = await res.json().catch(() => ({ error: `register failed (${res.status})` }));
    throw new Error((err as { error?: string }).error ?? `register failed (${res.status})`);
  }
  setCachedVaultId(vaultId);
  return { vaultId };
}

/** Unlock: exchange WebAuthn assertion for a JWT, pull cipher, decrypt. */
export async function unlockVault(
  prfOutput: ArrayBuffer,
  assertion: unknown,
): Promise<{ vaultId: string; entryCount: number }> {
  const vaultId = await deriveVaultId(prfOutput);
  const masterKey = await deriveMasterKey(prfOutput);

  let exchangeRes: Response;
  try {
    exchangeRes = await fetch(`${SYNC_URL}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId, assertion }),
    });
  } catch (e) {
    throw describeNetError(e, 'exchange');
  }
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
  setCachedVaultId(vaultId);
  return { vaultId, entryCount: Object.keys(plaintext.entries).length };
}

/** Get a fresh challenge from CF Worker for the unlock ceremony.
 *  Two entry points so the unlock flow can use the cached vaultId
 *  and skip the probe ceremony entirely. */
export async function getCfChallenge(prfOutput: ArrayBuffer): Promise<string> {
  const vaultId = await deriveVaultId(prfOutput);
  return getCfChallengeForVaultId(vaultId);
}

export async function getCfChallengeForVaultId(vaultId: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${SYNC_URL}/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId }),
    });
  } catch (e) {
    throw describeNetError(e, 'challenge');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `challenge failed (${res.status})` }));
    const msg = (err as { error?: string }).error ?? `challenge failed (${res.status})`;
    const unregistered = res.status === 404 && /vault not registered/i.test(msg);
    if (unregistered) clearCachedVaultId();
    throw new Error(
      unregistered
        ? `${msg} — stale browser cache cleared. Enroll passkey again (local wrangler resets wipe vault rows).`
        : msg,
    );
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
