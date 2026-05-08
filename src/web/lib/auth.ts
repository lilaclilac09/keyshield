/**
 * KeyShield auth helpers — localStorage-backed session token.
 */

export const API_BASE: string =
  (typeof process !== 'undefined' && (process.env as Record<string,string>)['KEYSHIELD_API_URL'])
  ?? 'http://localhost:8000';

const TOKEN_KEY    = 'ks_token';
const WALLET_KEY   = 'ks_wallet';
const PASSKEY_USER = 'ks_passkey_user';
const PASSKEY_PP   = 'ks_passkey_pp';

/** Mark this device as passkey-trusted: stores userId + passphrase locally
 *  so future sessions can sign in with Face ID / Touch ID alone. */
export function setPasskeyTrust(userId: string, passphrase: string): void {
  localStorage.setItem(PASSKEY_USER, userId);
  localStorage.setItem(PASSKEY_PP, passphrase);
}
export function getPasskeyTrust(): { userId: string; passphrase: string } | null {
  const u = localStorage.getItem(PASSKEY_USER);
  const p = localStorage.getItem(PASSKEY_PP);
  return u && p ? { userId: u, passphrase: p } : null;
}
export function clearPasskeyTrust(): void {
  localStorage.removeItem(PASSKEY_USER);
  localStorage.removeItem(PASSKEY_PP);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  pushTokenToExtension(token);
}
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WALLET_KEY);
  clearTokenInExtension();
}

// ── Browser extension bridge ────────────────────────────────────────────────
// When the dashboard logs in, push the session token to the KeyShield Chrome
// extension via chrome.runtime.sendMessage (externally_connectable). This lets
// the extension's content.js auto-detect and STORE keys without opening a tab.
//
// EXTENSION_IDS: list candidate extension IDs. Production replaces with the
// stable Chrome Web Store ID. For dev, we broadcast — the extension that has
// us in its externally_connectable list is the one that wins.

const EXTENSION_IDS: string[] = [
  // Replace with your unpacked extension ID from chrome://extensions
  // Or set localStorage['ks_ext_id'] = '<id>' to override at runtime
];

function getExtensionId(): string | null {
  const override = localStorage.getItem('ks_ext_id');
  if (override) return override;
  return EXTENSION_IDS[0] ?? null;
}

function hasChromeRuntime(): boolean {
  // @ts-ignore — chrome is injected into the page when the extension is installed
  return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;
}

export function pushTokenToExtension(token: string): void {
  if (!hasChromeRuntime()) return;
  const id = getExtensionId();
  if (!id) return;
  try {
    // @ts-ignore
    chrome.runtime.sendMessage(id, {
      type:  'KS_TOKEN_REGISTER',
      token,
      user:  getWalletAddress() ?? '',
    }, () => { /* ignore lastError if extension not installed */ });
  } catch { /* extension not installed — silent */ }
}

export function clearTokenInExtension(): void {
  if (!hasChromeRuntime()) return;
  const id = getExtensionId();
  if (!id) return;
  try {
    // @ts-ignore
    chrome.runtime.sendMessage(id, { type: 'KS_TOKEN_CLEAR' }, () => {});
  } catch { /* silent */ }
}

/** Returns whether the extension is installed AND has the current session token. */
export async function pingExtension(): Promise<{ installed: boolean; hasToken: boolean }> {
  if (!hasChromeRuntime()) return { installed: false, hasToken: false };
  const id = getExtensionId();
  if (!id) return { installed: false, hasToken: false };
  return new Promise(resolve => {
    try {
      // @ts-ignore
      chrome.runtime.sendMessage(id, { type: 'KS_PING' }, (resp: any) => {
        // @ts-ignore
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
export function getWalletAddress(): string | null {
  return localStorage.getItem(WALLET_KEY);
}
export function setWalletAddress(addr: string): void {
  localStorage.setItem(WALLET_KEY, addr);
}
export function isAuthenticated(): boolean {
  return !!getToken();
}

/** Authenticated fetch — injects Bearer token automatically.
 *  On 401 (except for /auth/* endpoints), wipes local auth and pings the app to
 *  bounce back to AuthScreen, so expired tokens don't leave the UI in a stale
 *  "logged in but every call fails" state. */
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

/** Fetch a one-time wallet challenge nonce from the backend. */
export async function fetchChallenge(): Promise<{ challenge: string; nonce: string }> {
  const res = await fetch(`${API_BASE}/auth/wallet-challenge`);
  if (!res.ok) throw new Error('Failed to fetch challenge');
  return res.json();
}

/** Submit signed challenge + passphrase → get session token. */
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

/** Notify other components that auth state changed. */
export function notifyAuthChanged(): void {
  window.dispatchEvent(new CustomEvent('ks-auth-changed'));
}

/** Sign in with the passkey registered on this device.
 *  Triggers Face ID / Touch ID / hardware key prompt, returns a session token. */
export async function passkeyLogin(): Promise<{ token: string; userId: string }> {
  const trust = getPasskeyTrust();
  if (!trust) throw new Error('No passkey registered on this device');
  const { userId, passphrase } = trust;

  const optsRes = await fetch(`${API_BASE}/auth/passkey/auth-options?user_id=${encodeURIComponent(userId)}`);
  if (!optsRes.ok) throw new Error('Failed to fetch passkey options — try wallet login');
  const opts = await optsRes.json();

  opts.challenge = _b64urlToBuffer(opts.challenge);
  if (opts.allowCredentials) {
    opts.allowCredentials = opts.allowCredentials.map((c: { id: string }) => ({
      ...c, id: _b64urlToBuffer(c.id),
    }));
  }

  const credential = await navigator.credentials.get({ publicKey: opts }) as PublicKeyCredential;
  if (!credential) throw new Error('Passkey authentication cancelled');

  const resp = credential.response as AuthenticatorAssertionResponse;
  const credPayload = {
    id: credential.id,
    rawId: _bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: _bufferToB64url(resp.authenticatorData),
      clientDataJSON:    _bufferToB64url(resp.clientDataJSON),
      signature:         _bufferToB64url(resp.signature),
      userHandle:        resp.userHandle ? _bufferToB64url(resp.userHandle) : null,
    },
  };

  const verRes = await fetch(
    `${API_BASE}/auth/passkey/auth-verify?user_id=${encodeURIComponent(userId)}&passphrase=${encodeURIComponent(passphrase)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: credPayload }),
    },
  );
  if (!verRes.ok) {
    const err = await verRes.json().catch(() => ({ detail: 'Passkey login failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Passkey login failed');
  }
  return verRes.json();
}

// ─── Passkey (WebAuthn) helpers ────────────────────────────────────────────

/** Fetch WebAuthn registration options, call browser API, verify with backend. */
export async function registerPasskey(name: string): Promise<{ credentialId: string; name: string }> {
  const optsRes = await apiFetch('/auth/passkey/register-options');
  if (!optsRes.ok) throw new Error('Failed to get registration options');
  const opts = await optsRes.json();

  // Convert base64url challenge to ArrayBuffer
  opts.challenge = _b64urlToBuffer(opts.challenge);
  opts.user.id   = _b64urlToBuffer(opts.user.id);
  if (opts.excludeCredentials) {
    opts.excludeCredentials = opts.excludeCredentials.map((c: { id: string }) => ({
      ...c, id: _b64urlToBuffer(c.id),
    }));
  }

  const credential = await navigator.credentials.create({ publicKey: opts }) as PublicKeyCredential;
  if (!credential) throw new Error('Passkey creation cancelled');

  const response = credential.response as AuthenticatorAttestationResponse;
  const credPayload = {
    id: credential.id,
    rawId: _bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: _bufferToB64url(response.attestationObject),
      clientDataJSON:    _bufferToB64url(response.clientDataJSON),
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
  return verRes.json();
}

/** List passkeys for the current user. */
export async function listPasskeys(): Promise<Array<{ id: string; name: string; createdAt: number }>> {
  const res = await apiFetch('/auth/passkey/list');
  if (!res.ok) return [];
  const data = await res.json();
  return data.credentials ?? [];
}

/** Delete a passkey by credential id. */
export async function deletePasskey(credId: string): Promise<void> {
  await apiFetch(`/auth/passkey/${encodeURIComponent(credId)}`, { method: 'DELETE' });
}

function _b64urlToBuffer(b64url: string): ArrayBuffer {
  const pad = 4 - (b64url.length % 4);
  const b64  = (pad !== 4 ? b64url + '='.repeat(pad) : b64url)
    .replace(/-/g, '+').replace(/_/g, '/');
  const bin  = atob(b64);
  const buf  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function _bufferToB64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
