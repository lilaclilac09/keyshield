/**
 * KeyShield client-side vault crypto — Path A.
 *
 * Master key + vault ID are derived from a WebAuthn PRF output via HKDF.
 * The master key is imported `extractable: false`, so JS heap dumps can't
 * exfiltrate raw key bytes — the secure element on the device is the
 * effective TEE. Server (Cloudflare Worker) never sees plaintext.
 *
 * Wire format (`VaultCipher`) matches `src/infra/sync-worker/src/cas.ts`
 * exactly so the server can do CAS on `updatedAt` without decrypting.
 */

const HKDF_HASH = 'SHA-256';
const KEY_BYTES = 32;
const VAULT_ID_BYTES = 16;
const IV_BYTES = 12;
const VAULT_VERSION = 1;

// Why two info strings: HKDF domain separation. Same PRF output, different
// purposes — publishing the vault ID to the server reveals nothing about the
// master key, and vice versa.
const INFO_MASTER = new TextEncoder().encode('ks-master-key-v1');
const INFO_VAULT_ID = new TextEncoder().encode('ks-vault-id-v1');

// Static HKDF salt — the PRF output already mixes in WebAuthn's random
// challenge each session, so a static salt here is fine and lets a vault be
// re-derived deterministically on any device.
const HKDF_SALT = new Uint8Array(0);

export interface VaultEntry {
  upstream: string;
  apiKey: string;
  addedAt: number;
}

export interface VaultPlaintext {
  entries: Record<string, VaultEntry>;
  updatedAt: number;
}

export interface VaultCipher {
  version: number;
  iv: string;          // base64url, 12 bytes
  ciphertext: string;  // base64url, AES-GCM(plaintext) including 16-byte tag
  updatedAt: number;   // mirrored from plaintext, used by server CAS
}

export function emptyVault(): VaultPlaintext {
  return { entries: {}, updatedAt: Date.now() };
}

export async function deriveMasterKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: HKDF_HASH,
      // @types/node 22: HKDF_SALT / INFO_MASTER are Uint8Array; cast
      // to BufferSource (compatible at runtime, narrowed for TS).
      salt: HKDF_SALT as BufferSource,
      info: INFO_MASTER as BufferSource,
    },
    ikm,
    KEY_BYTES * 8,
  );
  const view = new Uint8Array(bits);
  try {
    return await crypto.subtle.importKey('raw', view, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } finally {
    view.fill(0);
  }
}

export async function deriveVaultId(prfOutput: ArrayBuffer): Promise<string> {
  const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    // @types/node 22 + lib.dom both: HKDF salt + info now want
    // BufferSource. The Uint8Array<ArrayBufferLike> generic Vite picks
    // up clashes with BufferSource's expected ArrayBuffer-only buffer
    // — same cast as deriveMasterKey above.
    { name: 'HKDF', hash: HKDF_HASH, salt: HKDF_SALT as BufferSource, info: INFO_VAULT_ID as BufferSource },
    ikm,
    VAULT_ID_BYTES * 8,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function encryptVault(key: CryptoKey, plaintext: VaultPlaintext): Promise<VaultCipher> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(JSON.stringify(plaintext));
  // Same BufferSource cast as deriveVaultId — `data` is the freshly-
  // encoded plaintext, fully owned ArrayBuffer-backed Uint8Array, but
  // strict tsconfig sees Uint8Array<ArrayBufferLike>.
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource);
  return {
    version: VAULT_VERSION,
    iv: bytesToB64url(iv),
    ciphertext: bytesToB64url(new Uint8Array(ct)),
    updatedAt: plaintext.updatedAt,
  };
}

export async function decryptVault(key: CryptoKey, cipher: VaultCipher): Promise<VaultPlaintext> {
  if (cipher.version !== VAULT_VERSION) {
    throw new Error(`unsupported vault version ${cipher.version}`);
  }
  const iv = b64urlToBytes(cipher.iv);
  const ct = b64urlToBytes(cipher.ciphertext);
  // Uint8Array → BufferSource cast: @types/node 22 widens Uint8Array's
  // underlying buffer to ArrayBufferLike (incl. SharedArrayBuffer); WebCrypto
  // wants plain ArrayBufferView. Cast is a no-op at runtime.
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(pt)) as VaultPlaintext;
}

// ─── encoding helpers ─────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function bytesToB64url(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
