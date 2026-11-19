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

import { setZkRootFromPrf, clearZkRoot } from './zk';
import {
  decryptVault,
  deriveMasterKey,
  deriveVaultId,
  emptyVault,
  encryptVault,
  type VaultEntry,
  type VaultEntryMetadata,
  type VaultPlaintext,
  type VaultCipher,
} from './vault';
import { makeBearerHolder, prfSalt, type BearerHolder } from './sync-auth';
import { unb64u, b64u } from './zk';
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
let approvalSnapshot: { vaultId: string; cipher: VaultCipher } | null = null;
let snapshotEntries: Record<string, Record<string, unknown>> = {};
let snapshotAccount = '';
let approvalEpoch = 0;
let invalidations: Promise<unknown> = Promise.resolve();

function approvalAccount(): string {
  try { return JSON.stringify(['ks_wallet', 'ks_passkey_user', 'ks_token'].map((key) => localStorage.getItem(key))); }
  catch { return ''; }
}

export function invalidateApprovalSnapshot(): void {
  approvalSnapshot = null;
  snapshotEntries = {};
  approvalEpoch++;
  const broker = typeof window !== 'undefined' ? window.keyshieldDesktop?.broker : undefined;
  if (broker) {
    invalidations = invalidations.catch(() => {}).then(() => broker.invalidateApprovals());
    void invalidations.catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  const accountChanged = () => { if (snapshotAccount !== approvalAccount()) invalidateApprovalSnapshot(); };
  window.addEventListener('storage', accountChanged);
  window.addEventListener('ks-auth-changed', accountChanged);
  window.addEventListener('ks-vault-sync-error', invalidateApprovalSnapshot);
  window.addEventListener('ks-vault-cipher-pulled', (event) => {
    const detail = (event as CustomEvent<{ vaultId: string; revision: number }>).detail;
    if (approvalSnapshot && (detail.vaultId !== approvalSnapshot.vaultId || detail.revision !== approvalSnapshot.cipher.updatedAt)) invalidateApprovalSnapshot();
  });
}

function retainApprovalSnapshot(vaultId: string, cipher: VaultCipher | null, plaintext: VaultPlaintext): void {
  if (typeof window === 'undefined' || !window.keyshieldDesktop?.broker) return;
  const entries = Object.fromEntries(Object.entries(plaintext.entries).map(([id, entry]) => [id,
    Object.fromEntries(Object.entries(entry).filter(([key, value]) => (key === 'addedAt' || /label|expir|^(?:name|displayName)$/i.test(key)) &&
      (value === null || typeof value === 'string' || typeof value === 'number')).map(([key, value]) =>
      [key, typeof value === 'string' && entry.apiKey ? value.split(entry.apiKey).join('[REDACTED]') : value])),
  ]));
  if (approvalSnapshot && (approvalSnapshot.vaultId !== vaultId || approvalSnapshot.cipher.updatedAt !== cipher?.updatedAt ||
      JSON.stringify(snapshotEntries) !== JSON.stringify(entries))) invalidateApprovalSnapshot();
  snapshotEntries = entries;
  snapshotAccount = approvalAccount();
  approvalSnapshot = cipher ? { vaultId, cipher: {
    version: cipher.version, iv: cipher.iv, ciphertext: cipher.ciphertext, updatedAt: cipher.updatedAt,
  } } : null;
}

export function isVaultUnlocked(): boolean {
  return _state !== null;
}

export function lockVault(): void {
  clearZkRoot();
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
    invalidateApprovalSnapshot();
    throw describeNetError(e, 'register');
  }
  // 409 = already registered = OK (cross-device race or re-enrollment)
  if (!res.ok && res.status !== 409) {
    invalidateApprovalSnapshot();
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
  try { return await unlockVaultSession(prfOutput, assertion); }
  catch (e) { invalidateApprovalSnapshot(); throw e; }
}

async function unlockVaultSession(prfOutput: ArrayBuffer, assertion: unknown) {
  const vaultId = await deriveVaultId(prfOutput);
  if (approvalSnapshot && approvalSnapshot.vaultId !== vaultId) invalidateApprovalSnapshot();
  const masterKey = await deriveMasterKey(prfOutput);
  await setZkRootFromPrf(prfOutput); // ZK mode root, memory only (lib/zk.ts)

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
  retainApprovalSnapshot(vaultId, cipher, plaintext);

  _state = { vaultId, masterKey, bearer, sync, plaintext };
  setCachedVaultId(vaultId);
  return { vaultId, entryCount: Object.keys(plaintext.entries).length };
}

async function decryptEntryForApproval(
  prfOutput: ArrayBuffer,
  entryId: string,
): Promise<string> {
  if (!approvalSnapshot) throw new Error('unlock the device vault once first');
  const snapshot = approvalSnapshot;
  const vaultId = await deriveVaultId(prfOutput);
  if (snapshot.vaultId !== vaultId) throw new Error('entry not found');
  const masterKey = await deriveMasterKey(prfOutput);
  const plaintext = await decryptVault(masterKey, snapshot.cipher);
  const entry = Object.hasOwn(plaintext.entries, entryId) ? plaintext.entries[entryId] : undefined;
  if (!entry) throw new Error('entry not found');
  return entry.apiKey;
}

export async function approveRequestWithPasskey(requestId: string): Promise<void> {
  const broker = window.keyshieldDesktop?.broker;
  if (!broker) throw new Error('mock broker unavailable');
  if (snapshotAccount !== approvalAccount()) invalidateApprovalSnapshot();
  await invalidations;
  if (!approvalSnapshot) throw new Error('unlock the device vault once first');
  const epoch = approvalEpoch;
  const snapshot = approvalSnapshot;
  const request = (await broker.listRequests()).find((item) => item.id === requestId);
  if (!request || !Object.hasOwn(snapshotEntries, request.credential)) throw new Error('entry not found');
  const descriptor = { vaultId: snapshot.vaultId, revision: snapshot.cipher.updatedAt,
    entryId: request.credential, metadata: snapshotEntries[request.credential] };
  const approval = await broker.beginApproval({ requestId, snapshot: descriptor });
  if (approval.binding.requestId !== requestId) throw new Error('approval binding mismatch');
  if (JSON.stringify(approval.binding.snapshot) !== JSON.stringify(descriptor)) throw new Error('approval binding mismatch');
  const credential = await navigator.credentials.get({ publicKey: {
    challenge: unb64u(approval.challenge).buffer,
    rpId: approval.rpId,
    allowCredentials: [{ type: 'public-key', id: unb64u(approval.credentialId).buffer }],
    userVerification: 'required',
    extensions: { prf: { eval: { first: await prfSalt() } } } as AuthenticationExtensionsClientInputs,
  } }) as PublicKeyCredential | null;
  if (!credential) throw new Error('Passkey ceremony cancelled');
  const ext = credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const prfOutput = ext.prf?.results?.first;
  if (!prfOutput) throw new Error('Passkey did not return PRF');
  if (epoch !== approvalEpoch || snapshot !== approvalSnapshot || snapshotAccount !== approvalAccount()) {
    invalidateApprovalSnapshot(); throw new Error('approval snapshot changed');
  }
  const response = credential.response as AuthenticatorAssertionResponse;
  const encode = (value: ArrayBuffer) => b64u(new Uint8Array(value));
  const assertion = {
    id: credential.id, rawId: encode(credential.rawId), type: credential.type,
    clientExtensionResults: {},
    response: { authenticatorData: encode(response.authenticatorData), clientDataJSON: encode(response.clientDataJSON),
      signature: encode(response.signature), userHandle: response.userHandle ? encode(response.userHandle) : undefined },
  };
  const secret = await decryptEntryForApproval(prfOutput, approval.binding.entryId);
  if (epoch !== approvalEpoch || snapshot !== approvalSnapshot) throw new Error('approval snapshot changed');
  await broker.approve({ requestId, assertion, secret, snapshot: descriptor });
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
    invalidateApprovalSnapshot();
    throw describeNetError(e, 'challenge');
  }
  if (!res.ok) {
    invalidateApprovalSnapshot();
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

let pendingAddition: Promise<void> = Promise.resolve();

export async function addEntry(upstream: string, apiKey: string, metadata: VaultEntryMetadata = {}): Promise<void> {
  const session = _state;
  const addition = pendingAddition.catch(() => {}).then(async () => {
    if (!session || _state !== session) throw new VaultLockedError();
    const entries = session.plaintext.entries;
    if (Object.entries(entries).some(([id, entry]) =>
      (id === upstream || (id.startsWith(`${upstream}#`) && /^\d+$/.test(id.slice(upstream.length + 1)))) && entry.apiKey === apiKey,
    )) return;
    let id = upstream;
    for (let suffix = 2; entries[id]; suffix++) id = `${upstream}#${suffix}`;
    await mutate((p) => {
      p.entries[id] = { ...metadata, upstream: id, apiKey, addedAt: Date.now() };
    });
  });
  pendingAddition = addition;
  await addition;
}

export async function removeEntry(upstream: string): Promise<void> {
  await mutate((p) => {
    delete p.entries[upstream];
  });
}

async function mutate(fn: (p: VaultPlaintext) => void): Promise<void> {
  invalidateApprovalSnapshot();
  try { await mutateSession(fn); }
  catch (e) { invalidateApprovalSnapshot(); throw e; }
}

async function mutateSession(fn: (p: VaultPlaintext) => void): Promise<void> {
  if (!_state) throw new Error('vault locked');
  const next: VaultPlaintext = {
    entries: { ..._state.plaintext.entries },
    updatedAt: Date.now(),
  };
  fn(next);
  const cipher = await encryptVault(_state.masterKey, next);
  const payload = {
    version: cipher.version,
    iv: cipher.iv,
    ciphertext: cipher.ciphertext,
    updatedAt: cipher.updatedAt,
  };
  const outgoing = JSON.stringify(payload);
  if (Object.values(next.entries).some(({ apiKey }) => apiKey && outgoing.includes(JSON.stringify(apiKey).slice(1, -1)))) {
    throw new Error('Refusing unsafe vault sync payload');
  }
  const result = await _state.sync.push(_state.vaultId, payload, () => _state!.bearer.get());
  if (result === 'conflict') {
    // Last-write-wins for v1 — pull, take server's, surface to user via re-render.
    // Why: full conflict-merge UX is out of scope for hackathon; the CAS still
    // protects against silent overwrite (we threw, caller can retry).
    throw new Error('vault conflict — another device wrote first; reload to refresh');
  }
  _state.plaintext = next;
  retainApprovalSnapshot(_state.vaultId, payload, next);
}

export class VaultLockedError extends Error {
  constructor() { super('vault locked — unlock with passkey first'); }
}

export { SyncAuthError };
