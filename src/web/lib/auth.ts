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

export const API_BASE: string = (() => {
  // vite's `define` replaces this literal string with the build-time value.
  // The destructure-into-local-var pattern would NOT be replaced — vite
  // only does textual substitution of the exact `process.env.KEYSHIELD_API_URL`.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof process !== 'undefined' && process.env.KEYSHIELD_API_URL) {
    return process.env.KEYSHIELD_API_URL;
  }
  // Runtime fallback when Vercel build env is missing: only use localhost
  // when actually on localhost. In any other origin, point at Railway.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0') {
      return 'https://keyshield-production.up.railway.app';
    }
  }
  return 'http://localhost:8001';
})();

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
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && !path.startsWith('/auth/')) {
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
  return fetch(`${API_BASE}/proxy/${upstream}/${path.replace(/^\//, '')}`, { ...options, headers });
}

// ── Wallet challenge/login ────────────────────────────────────────────────

export async function fetchChallenge(): Promise<{ challenge: string; nonce: string }> {
  const res = await fetch(`${API_BASE}/auth/wallet-challenge`);
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
  const res = await fetch(`${API_BASE}/auth/wallet-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, signature, challenge, passphrase }),
  });
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

  const optsRes = await fetch(`${API_BASE}/auth/passkey/auth-options?user_id=${encodeURIComponent(userId)}`);
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

  const verRes = await fetch(
    `${API_BASE}/auth/passkey/auth-verify?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: credPayload, passphrase }),
    },
  );
  if (!verRes.ok) {
    const err = await verRes.json().catch(() => ({ detail: 'Passkey login failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Passkey login failed');
  }
  return verRes.json();
}

export async function registerPasskey(name: string): Promise<{ credentialId: string; name: string }> {
  const optsRes = await apiFetch('/auth/passkey/register-options');
  if (!optsRes.ok) throw new Error('Failed to get registration options');
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

  const credential = await navigator.credentials.create({ publicKey: opts }) as PublicKeyCredential;
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
    body: JSON.stringify({ credential: credPayload, name }),
  });
  if (!verRes.ok) {
    const err = await verRes.json().catch(() => ({ detail: 'Registration failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Registration failed');
  }
  const result = await verRes.json();

  // Path A dual-register: tell the CF Worker about this credential so
  // subsequent unlocks can issue a vault JWT. PRF output is in extensions
  // results — without it we can't derive the vault id at all, which makes
  // the whole Path A vault unusable, so we fail loudly instead of pretending
  // enrollment succeeded.
  const ext = credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const prfOutput = ext?.prf?.results?.first;
  if (!prfOutput) {
    throw new Error(
      'Passkey created without PRF extension — this browser/authenticator ' +
      'does not support the vault crypto KeyShield needs. Try Chrome/Safari ' +
      'on a recent OS with platform authenticator support.',
    );
  }
  // Surface CF Worker failures: previously this was swallowed by console.warn,
  // which made the UI report success even though the vault was never registered.
  // That looked like "passkey 无法存储" because subsequent unlock had no row to
  // find on the worker side.
  await enrollVault(prfOutput, {
    id: credential.id,
    rawId: _bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: _bufferToB64url(response.attestationObject),
      clientDataJSON: _bufferToB64url(response.clientDataJSON),
    },
    clientExtensionResults: { prf: { enabled: true } },
  }, challengeB64url);

  return result;
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
  const optsRes = await fetch(`${API_BASE}/auth/passkey/auth-options?user_id=${encodeURIComponent(userId)}`);
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
