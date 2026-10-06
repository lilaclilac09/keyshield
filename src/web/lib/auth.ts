/**
 * KeyShield auth — localStorage session, API fetch, wallet/passkey login.
 *
 * Path A wiring: passkey ceremonies request the WebAuthn PRF extension and
 * pipe the output into vault-session for client-side AES-GCM. The Python
 * backend continues to issue the bearer session (identity); the Cloudflare
 * Worker handles vault storage (zero-knowledge).
 */

import { prfSalt } from './sync-auth';
import {
  enrollVault,
  unlockVault,
  getCfChallenge,
  getCfChallengeForVaultId,
  getCachedVaultId,
  clearCachedVaultId,
  lockVault,
  getDecryptedKey,
} from './vault-session';
import { clearExtensionVaultKey, syncExtensionVaultKey } from './vault-key';
import {
  isLocalhostUrl,
  PROD_API_BASE,
  usePublicControlPlaneFallback,
} from './host-deploy';

export const API_BASE: string = (() => {
  // vite's `define` replaces this literal string with the build-time value.
  // The destructure-into-local-var pattern would NOT be replaced — vite
  // only does textual substitution of the exact `process.env.KEYSHIELD_API_URL`.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const fromBuild =
    typeof process !== 'undefined' && process.env.KEYSHIELD_API_URL
      ? process.env.KEYSHIELD_API_URL
      : '';

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Hosted dashboard but bundle still has localhost API → public control plane.
    if (usePublicControlPlaneFallback(host, fromBuild)) {
      return PROD_API_BASE;
    }
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      // Vite bakes KEYSHIELD_API_URL into the bundle. If it points at prod while you
      // open the dashboard on localhost, fetch() hits a dead or blocked API and
      // wallet login shows "API unreachable at https://api.ks..." — use a local
      // control plane by default; only honor build-time URL when it is still local
      // (custom port / 127.0.0.1).
      if (fromBuild && isLocalhostUrl(fromBuild)) return fromBuild;
      return 'http://127.0.0.1:8001';
    }
    if (fromBuild && !isLocalhostUrl(fromBuild)) {
      return fromBuild;
    }
    return PROD_API_BASE;
  }

  return fromBuild || 'http://127.0.0.1:8001';
})();

/** Same idea as vault-session's describeNetError — dead API in dev yields a
 *  useless "Failed to fetch" / TypeError; point people at uvicorn + port. */
function describeApiNetError(e: unknown, hint: string): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof TypeError || /fetch|network/i.test(msg)) {
    return new Error(
      `API unreachable at ${API_BASE} (${hint}). ` +
      'From the repo root:  python3 -m uvicorn src.backend.app:app --host 127.0.0.1 --port 8001  ' +
      '(or  npm run dev:api)',
    );
  }
  return e instanceof Error ? e : new Error(msg);
}

/** Thrown when navigator.credentials.create() hits InvalidStateError: the
 *  authenticator already has a credential registered for this user/RP. The
 *  UI should route the user into the unlock flow instead of retrying. */
export class PasskeyAlreadyEnrolledError extends Error {
  constructor() {
    super('A passkey is already enrolled for this account on this device — tap to unlock instead of enrolling again.');
    this.name = 'PasskeyAlreadyEnrolledError';
  }
}

const TOKEN_KEY = 'ks_token';
const WALLET_KEY = 'ks_wallet';
const PASSKEY_USER = 'ks_passkey_user';
const PASSKEY_PP = 'ks_passkey_pp';

// ── Token management ──────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  pushTokenToExtension(token);
  syncExtensionVaultKey();
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WALLET_KEY);
  clearTokenInExtension();
  clearExtensionVaultKey();
  lockVault();
  clearCachedVaultId();
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getWalletAddress(): string | null {
  return localStorage.getItem(WALLET_KEY);
}

export function setWalletAddress(addr: string): void {
  localStorage.setItem(WALLET_KEY, addr);
}

// ── Auth state events ─────────────────────────────────────────────────────

export function notifyAuthChanged(): void {
  window.dispatchEvent(new CustomEvent('ks-auth-changed'));
}

// ── Extension bridge ──────────────────────────────────────────────────────

const EXTENSION_IDS: string[] = [];

function getExtensionId(): string | null {
  const override = localStorage.getItem('ks_ext_id');
  if (override) return override;
  return EXTENSION_IDS[0] ?? null;
}

function hasChromeRuntime(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;
}

export function pushTokenToExtension(token: string): void {
  if (!hasChromeRuntime()) return;
  const id = getExtensionId();
  if (!id) return;
  try {
    chrome.runtime.sendMessage(id, {
      type: 'KS_TOKEN_REGISTER', token, user: getWalletAddress() ?? '',
    }, () => { /* ignore */ });
  } catch { /* silent */ }
}

export function clearTokenInExtension(): void {
  if (!hasChromeRuntime()) return;
  const id = getExtensionId();
  if (!id) return;
  try {
    chrome.runtime.sendMessage(id, { type: 'KS_TOKEN_CLEAR' }, () => {});
  } catch { /* silent */ }
}

export async function pingExtension(): Promise<{ installed: boolean; hasToken: boolean }> {
  if (!hasChromeRuntime()) return { installed: false, hasToken: false };
  const id = getExtensionId();
  if (!id) return { installed: false, hasToken: false };
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(id, { type: 'KS_PING' }, (resp: any) => {
        if (chrome.runtime.lastError) {
          resolve({ installed: false, hasToken: false });
        } else {
          resolve({ installed: true, hasToken: !!resp?.hasToken });
        }
      });
    } catch {
      resolve({ installed: false, hasToken: false });
    }
  });
}

// ── Authenticated fetch ───────────────────────────────────────────────────

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (e) {
    throw describeApiNetError(e, path);
  }
  // Only drop the session when THIS request presented a bearer token that
  // the server rejected. A late 401 from a pre-login /manage/vault probe
  // must not wipe a token Start demo just wrote (React Strict Mode +
  // useVaults both fire that GET on the auth screen).
  if (res.status === 401 && token && getToken() === token && !path.startsWith('/auth/')) {
    clearAuth();
    clearPasskeyTrust();
    notifyAuthChanged();
  }
  return res;
}

/**
 * Path A proxy call — pulls the upstream key out of the unlocked vault and
 * sends it in `X-Upstream-API-Key` per request. Server uses it for one
 * upstream HTTP call and discards. Vault must be unlocked first.
 */
export async function proxyFetch(
  upstream: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const apiKey = getDecryptedKey(upstream);
  if (!apiKey) throw new Error(`Vault locked or no key for "${upstream}"`);
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Upstream-API-Key', apiKey);
  try {
    return await fetch(
      `${API_BASE}/proxy/${upstream}/${path.replace(/^\//, '')}`,
      { ...options, headers },
    );
  } catch (e) {
    throw describeApiNetError(e, `/proxy/${upstream}`);
  }
}

/** Server vault (`/manage/store`) — no Device Vault unlock required. */
export async function vproxyFetch(
  upstream: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  try {
    return await fetch(
      `${API_BASE}/vproxy/${upstream}/${path.replace(/^\//, '')}`,
      { ...options, headers },
    );
  } catch (e) {
    throw describeApiNetError(e, `/vproxy/${upstream}`);
  }
}

export async function startDemoSession(): Promise<{
  token: string;
  userId: string;
  demo: boolean;
  agent?: { pubkey_b58: string; name: string };
  model?: string;
  upstream?: string;
}> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/demo-session`, { method: 'POST' });
  } catch (e) {
    throw describeApiNetError(e, '/auth/demo-session');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Demo login failed' }));
    throw new Error((err as { error?: string; detail?: string }).error
      ?? (err as { detail?: string }).detail
      ?? 'Demo login failed');
  }
  return res.json();
}

// ── Wallet challenge/login ────────────────────────────────────────────────

export async function fetchChallenge(): Promise<{ challenge: string; nonce: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/wallet-challenge`);
  } catch (e) {
    throw describeApiNetError(e, '/auth/wallet-challenge');
  }
  if (!res.ok) throw new Error('Failed to fetch challenge');
  return res.json();
}

export async function walletLogin(
  walletAddress: string,
  signatureBytes: Uint8Array,
  challenge: string,
  passphrase: string,
): Promise<{ token: string; userId: string }> {
  const signature = btoa(String.fromCharCode(...signatureBytes));
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/wallet-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, signature, challenge, passphrase }),
    });
  } catch (e) {
    throw describeApiNetError(e, '/auth/wallet-login');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Login failed');
  }
  return res.json();
}

// ── Passkey helpers ───────────────────────────────────────────────────────

/** Mark this device as passkey-trusted. userId is non-secret → localStorage.
 *  passphrase is secret → sessionStorage (cleared on tab close, never persisted). */
export function setPasskeyTrust(userId: string, passphrase: string): void {
  localStorage.setItem(PASSKEY_USER, userId);
  sessionStorage.setItem(PASSKEY_PP, passphrase);
}

export function getPasskeyTrust(): { userId: string; passphrase: string } | null {
  const u = localStorage.getItem(PASSKEY_USER);
  if (!u) return null;
  // Migration: if passphrase was previously stored in localStorage (pre-P0 fix),
  // move it to sessionStorage and remove from localStorage on first access.
  const legacy = localStorage.getItem(PASSKEY_PP);
  if (legacy) {
    sessionStorage.setItem(PASSKEY_PP, legacy);
    localStorage.removeItem(PASSKEY_PP);
  }
  const p = sessionStorage.getItem(PASSKEY_PP);
  // p may be null (sessionStorage cleared on tab close) or '' (empty passphrase).
  // Return trust as long as userId is known — passphrase defaults to empty string.
  return { userId: u, passphrase: p ?? '' };
}

export function clearPasskeyTrust(): void {
  localStorage.removeItem(PASSKEY_USER);
  localStorage.removeItem(PASSKEY_PP);
  sessionStorage.removeItem(PASSKEY_PP);
}

export async function passkeyLogin(): Promise<{ token: string; userId: string }> {
  const trust = getPasskeyTrust();
  if (!trust) throw new Error('No passkey registered on this device');
  const { userId, passphrase } = trust;

  let optsRes: Response;
  try {
    optsRes = await fetch(
      `${API_BASE}/auth/passkey/auth-options?user_id=${encodeURIComponent(userId)}`,
    );
  } catch (e) {
    throw describeApiNetError(e, '/auth/passkey/auth-options');
  }
  if (!optsRes.ok) throw new Error('Failed to fetch passkey options');
  const opts = await optsRes.json();

  opts.challenge = _b64urlToBuffer(opts.challenge);
  if (opts.allowCredentials) {
    opts.allowCredentials = opts.allowCredentials.map((c: { id: string }) => ({
      ...c, id: _b64urlToBuffer(c.id),
    }));
  }

  // Path A: ask the authenticator for a PRF output we can derive vault keys from.
  const salt = await prfSalt();
  opts.extensions = { ...(opts.extensions ?? {}), prf: { eval: { first: salt } } };

  const credential = await navigator.credentials.get({ publicKey: opts }) as PublicKeyCredential;
  if (!credential) throw new Error('Passkey authentication cancelled');

  const resp = credential.response as AuthenticatorAssertionResponse;
  const credPayload = {
    id: credential.id,
    rawId: _bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: _bufferToB64url(resp.authenticatorData),
      clientDataJSON: _bufferToB64url(resp.clientDataJSON),
      signature: _bufferToB64url(resp.signature),
      userHandle: resp.userHandle ? _bufferToB64url(resp.userHandle) : null,
    },
  };

  let verRes: Response;
  try {
    verRes = await fetch(
      `${API_BASE}/auth/passkey/auth-verify?user_id=${encodeURIComponent(userId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credPayload, passphrase }),
      },
    );
  } catch (e) {
    throw describeApiNetError(e, '/auth/passkey/auth-verify');
  }
  if (!verRes.ok) {
    const err = await verRes.json().catch(() => ({ detail: 'Passkey login failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Passkey login failed');
  }
  return verRes.json();
}

export async function registerPasskey(
  name: string,
  deviceLevel: 'personal' | 'companion' | 'runtime' = 'personal',
): Promise<{ credentialId: string; name: string; vaultEnrolled?: boolean; vaultWarning?: string }> {
  const optsRes = await apiFetch(
    `/auth/passkey/register-options?device_level=${encodeURIComponent(deviceLevel)}`,
  );
  if (!optsRes.ok) {
    const err = await optsRes.json().catch(() => ({ detail: 'Failed to get registration options' }));
    throw new Error(
      (err as { detail?: string; error?: string }).detail
        ?? (err as { error?: string }).error
        ?? 'Failed to get registration options',
    );
  }
  const opts = await optsRes.json();

  // Why: WebAuthn challenge from Python is base64url ASCII; CF Worker's
  // expectedChallenge needs the same string verbatim so the assertion
  // verifies on both sides.
  const challengeB64url: string = opts.challenge;

  opts.challenge = _b64urlToBuffer(opts.challenge);
  opts.user.id = _b64urlToBuffer(opts.user.id);
  if (opts.excludeCredentials) {
    opts.excludeCredentials = opts.excludeCredentials.map((c: { id: string }) => ({
      ...c, id: _b64urlToBuffer(c.id),
    }));
  }

  // Path A: PRF extension. The salt MUST match what unlock uses, otherwise
  // the master key derived later won't decrypt this device's vault.
  const salt = await prfSalt();
  opts.extensions = { ...(opts.extensions ?? {}), prf: { eval: { first: salt } } };

  let credential: PublicKeyCredential;
  try {
    credential = await navigator.credentials.create({ publicKey: opts }) as PublicKeyCredential;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'InvalidStateError') {
      // Authenticator already has a credential for this user/RP — the caller
      // should switch to the unlock flow instead of enrolling a duplicate.
      throw new PasskeyAlreadyEnrolledError();
    }
    throw e;
  }
  if (!credential) throw new Error('Passkey creation cancelled');

  const response = credential.response as AuthenticatorAttestationResponse;
  const credPayload = {
    id: credential.id,
    rawId: _bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: _bufferToB64url(response.attestationObject),
      clientDataJSON: _bufferToB64url(response.clientDataJSON),
    },
  };

  const verRes = await apiFetch('/auth/passkey/register-verify', {
    method: 'POST',
    body: JSON.stringify({ credential: credPayload, name, device_level: deviceLevel }),
  });
  if (!verRes.ok) {
    const err = await verRes.json().catch(() => ({ detail: 'Registration failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Registration failed');
  }
  const result = await verRes.json();

  // Identity passkey is stored on the Python control plane at this point.
  // Path A Device Vault still needs PRF + the Cloudflare worker. Do not fail
  // the identity ceremony if the authenticator has no PRF (virtual
  // authenticators, some hardware keys) or the worker is unreachable —
  // Settings can show Face ID success; Device Vault enroll retries later.
  const ext = credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const prfOutput = ext?.prf?.results?.first;
  if (!prfOutput) {
    return {
      ...result,
      vaultEnrolled: false,
      vaultWarning:
        'Passkey saved for sign-in. Device Vault needs a PRF-capable authenticator (Chrome/Safari platform passkey).',
    };
  }
  try {
    await Promise.race([
      enrollVault(prfOutput, {
        id: credential.id,
        rawId: _bufferToB64url(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: _bufferToB64url(response.attestationObject),
          clientDataJSON: _bufferToB64url(response.clientDataJSON),
        },
        clientExtensionResults: { prf: { enabled: true } },
      }, challengeB64url),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('Device Vault enroll timed out')), 2500);
      }),
    ]);
    return { ...result, vaultEnrolled: true };
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'vault enroll failed';
    return {
      ...result,
      vaultEnrolled: false,
      vaultWarning: `Passkey saved for sign-in. Device Vault enroll deferred: ${detail}`,
    };
  }
}

/**
 * Path A unlock — fresh WebAuthn ceremony against the CF Worker challenge,
 * derives master key from PRF output, exchanges assertion for a vault JWT,
 * pulls + decrypts the cipher into module state.
 *
 * Done as a separate gesture (not bundled into passkeyLogin) so the user
 * sees one Face ID prompt per security domain: identity (Python session)
 * and vault (CF Worker JWT).
 */
export async function requestVaultUnlock(): Promise<{ vaultId: string; entryCount: number }> {
  const trust = getPasskeyTrust();
  if (!trust) throw new Error('No passkey registered on this device');
  const { userId } = trust;

  // Reuse Python's options endpoint just to learn allowed credential IDs;
  // the challenge we'll use is the CF Worker's, so the assertion verifies
  // there. We discard Python's challenge.
  let optsRes: Response;
  try {
    optsRes = await fetch(
      `${API_BASE}/auth/passkey/auth-options?user_id=${encodeURIComponent(userId)}`,
    );
  } catch (e) {
    throw describeApiNetError(e, '/auth/passkey/auth-options');
  }
  if (!optsRes.ok) throw new Error('Failed to fetch passkey options');
  const opts = await optsRes.json();

  const salt = await prfSalt();
  const allowCreds = (opts.allowCredentials ?? []).map((c: { id: string }) => ({
    ...c, id: _b64urlToBuffer(c.id),
  }));

  // Fast path: vaultId was cached at enroll/unlock time → ask CF Worker for
  // a challenge bound to that vaultId and do a single WebAuthn ceremony.
  // Single Face ID prompt, no probe ceremony.
  //
  // Slow path: no cache (e.g. cleared, fresh browser profile) → do the probe
  // ceremony to derive vaultId from PRF, then a second ceremony with the
  // CF-issued challenge. 2 Face ID prompts.
  const cached = getCachedVaultId();
  if (cached) {
    const cfChallenge = await getCfChallengeForVaultId(cached);
    const realOpts = {
      ...opts,
      challenge: _b64urlToBuffer(cfChallenge),
      allowCredentials: allowCreds,
      extensions: { prf: { eval: { first: salt } } },
    };
    const credential = await navigator.credentials.get({ publicKey: realOpts }) as PublicKeyCredential;
    const realExt = credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
    const prfOutput = realExt?.prf?.results?.first;
    if (!prfOutput) throw new Error('Passkey did not return PRF — device unsupported for Path A vault');
    const resp = credential.response as AuthenticatorAssertionResponse;
    const assertion = {
      id: credential.id,
      rawId: _bufferToB64url(credential.rawId),
      type: credential.type,
      response: {
        authenticatorData: _bufferToB64url(resp.authenticatorData),
        clientDataJSON: _bufferToB64url(resp.clientDataJSON),
        signature: _bufferToB64url(resp.signature),
        userHandle: resp.userHandle ? _bufferToB64url(resp.userHandle) : undefined,
      },
    };
    return await unlockVault(prfOutput, assertion);
  }

  // Probe ceremony — only runs once per device (until cache is cleared).
  const probeOpts = {
    ...opts,
    challenge: _b64urlToBuffer(opts.challenge),
    allowCredentials: allowCreds,
    extensions: { prf: { eval: { first: salt } } },
  };
  const probe = await navigator.credentials.get({ publicKey: probeOpts }) as PublicKeyCredential;
  const probeExt = probe.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const prfOutput = probeExt?.prf?.results?.first;
  if (!prfOutput) throw new Error('Passkey did not return PRF — device unsupported for Path A vault');

  const cfChallenge = await getCfChallenge(prfOutput);
  const realOpts = {
    ...opts,
    challenge: _b64urlToBuffer(cfChallenge),
    allowCredentials: allowCreds,
    extensions: { prf: { eval: { first: salt } } },
  };
  const credential = await navigator.credentials.get({ publicKey: realOpts }) as PublicKeyCredential;
  const resp = credential.response as AuthenticatorAssertionResponse;
  const assertion = {
    id: credential.id,
    rawId: _bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: _bufferToB64url(resp.authenticatorData),
      clientDataJSON: _bufferToB64url(resp.clientDataJSON),
      signature: _bufferToB64url(resp.signature),
      userHandle: resp.userHandle ? _bufferToB64url(resp.userHandle) : undefined,
    },
  };

  return await unlockVault(prfOutput, assertion);
}

export async function listPasskeys(): Promise<Array<{ id: string; name: string; createdAt: number }>> {
  const res = await apiFetch('/auth/passkey/list');
  if (!res.ok) return [];
  const data = await res.json();
  return data.credentials ?? [];
}

export async function deletePasskey(credId: string): Promise<void> {
  await apiFetch(`/auth/passkey/${encodeURIComponent(credId)}`, { method: 'DELETE' });
}

// ── Base64url helpers ─────────────────────────────────────────────────────

function _b64urlToBuffer(b64url: string): ArrayBuffer {
  const pad = 4 - (b64url.length % 4);
  const b64 = (pad !== 4 ? b64url + '='.repeat(pad) : b64url)
    .replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function _bufferToB64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
