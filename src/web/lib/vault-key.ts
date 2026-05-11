export const VAULT_KEY_MESSAGE = 'KeyShield Vault Key Derivation v1';
const EXTENSION_VAULT_INFO = 'ks-extension-vault-v1';
const EXTENSION_VAULT_KEY_STORAGE = 'ks_vault_key_b64u';
const EXTENSION_ID_STORAGE_KEY = 'ks_ext_id';

let _extensionId: string | null = null;
const _pendingExtensionPushes: Array<Record<string, unknown>> = [];

function _b64uEnc(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _hasChromeRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as any).chrome?.runtime?.sendMessage;
}

function _setExtensionId(id: string): void {
  _extensionId = id;
  try { localStorage.setItem(EXTENSION_ID_STORAGE_KEY, id); } catch { /* noop */ }
  _flushPendingExtensionPushes();
}

function _flushPendingExtensionPushes(): void {
  if (!_extensionId || !_hasChromeRuntime()) return;
  const runtime = (window as any).chrome.runtime;
  while (_pendingExtensionPushes.length > 0) {
    const payload = _pendingExtensionPushes.shift()!;
    try {
      runtime.sendMessage(_extensionId, payload, () => {});
    } catch {
      // no-op; if the extension is unavailable, we just drop the message.
    }
  }
}

function _pushToExtension(payload: Record<string, unknown>): void {
  _pendingExtensionPushes.push(payload);
  _flushPendingExtensionPushes();
}

export async function deriveVaultPassphrase(sigBytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', sigBytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

export async function deriveExtensionVaultKey(sigBytes: Uint8Array): Promise<string> {
  const ikm = await crypto.subtle.importKey('raw', sigBytes, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(EXTENSION_VAULT_INFO),
    },
    ikm,
    256,
  );
  return _b64uEnc(new Uint8Array(bits));
}

export async function registerExtensionVaultKey(sigBytes: Uint8Array): Promise<void> {
  try {
    const keyB64 = await deriveExtensionVaultKey(sigBytes);
    try { sessionStorage.setItem(EXTENSION_VAULT_KEY_STORAGE, keyB64); } catch { /* ignore */ }
    _pushToExtension({ type: 'KS_VAULT_KEY_REGISTER', keyB64 });
  } catch {
    // If the browser doesn't support HKDF or storage is unavailable, do nothing.
  }
}

export function syncExtensionVaultKey(): void {
  if (typeof window === 'undefined') return;
  let keyB64: string | null = null;
  try { keyB64 = sessionStorage.getItem(EXTENSION_VAULT_KEY_STORAGE); } catch { /* ignore */ }
  if (keyB64) {
    _pushToExtension({ type: 'KS_VAULT_KEY_REGISTER', keyB64 });
  }
}

export function clearExtensionVaultKey(): void {
  try { sessionStorage.removeItem(EXTENSION_VAULT_KEY_STORAGE); } catch { /* ignore */ }
  _pushToExtension({ type: 'KS_VAULT_KEY_CLEAR' });
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;
    const data = event.data as { __ks_ext_announce?: unknown };
    if (typeof data.__ks_ext_announce === 'string') {
      _setExtensionId(data.__ks_ext_announce);
    }
  });
  try { window.postMessage({ __ks_ext_request: true }, window.location.origin); } catch { /* ignore */ }
}
