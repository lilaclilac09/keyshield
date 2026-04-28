/**
 * Seed envelope — wraps the 32-byte vault seed with a key derived
 * from the WebAuthn PRF output, so daily unlock can recover the
 * seed without re-typing the 24-word recovery phrase.
 *
 * The seed is the long-term root: every device with the synced
 * passkey produces the same PRF output, derives the same wrapping
 * key via HKDF, and unwraps the same seed. The recovery phrase is
 * an alternative path to the same seed.
 *
 * Wrapped layout (stored as part of VaultCipher.seedEnvelope):
 *   { iv (12 bytes, base64), ciphertext (40 bytes, base64) }
 *
 * Where ciphertext = AES-GCM_encrypt(seed, wrapKey, iv)
 * and wrapKey  = HKDF(prfSecret, info='keyshield-prf-v1:seed-wrap-key')
 *
 * Why a different `info` than the encryption-key / vault-id derivations?
 * Domain separation: a key with one role (wrapping) cannot be
 * substituted for a key with another role. If the seed-wrap key
 * leaked, an attacker still couldn't directly decrypt vault contents.
 */

import type { CryptoBackend, SeedEnvelope } from './vault';

export type { SeedEnvelope };

const HKDF_INFO = 'keyshield-prf-v1:seed-wrap-key';

function u8ToB64(u8: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function b64ToU8(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

async function deriveWrapKey(
  prfSecret: Uint8Array,
  crypto: CryptoBackend,
): Promise<CryptoKey> {
  if (prfSecret.length !== 32) {
    throw new Error(`PRF secret must be 32 bytes, got ${prfSecret.length}`);
  }
  const ikm = await crypto.subtle.importKey(
    'raw',
    prfSecret as BufferSource,
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt the 32-byte seed under the device's PRF-derived wrap key. */
export async function wrapSeed(
  seed: Uint8Array,
  prfSecret: Uint8Array,
  crypto: CryptoBackend,
): Promise<SeedEnvelope> {
  if (seed.length !== 32) {
    throw new Error(`seed must be 32 bytes, got ${seed.length}`);
  }
  const wrapKey = await deriveWrapKey(prfSecret, crypto);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    wrapKey,
    seed as BufferSource,
  );
  return {
    iv: u8ToB64(iv),
    ciphertext: u8ToB64(new Uint8Array(cipher)),
  };
}

/** Reverse of wrapSeed. Throws if the PRF secret doesn't match. */
export async function unwrapSeed(
  envelope: SeedEnvelope,
  prfSecret: Uint8Array,
  crypto: CryptoBackend,
): Promise<Uint8Array> {
  const wrapKey = await deriveWrapKey(prfSecret, crypto);
  const iv = b64ToU8(envelope.iv);
  const ct = b64ToU8(envelope.ciphertext);
  const seedBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    wrapKey,
    ct as BufferSource,
  );
  const seed = new Uint8Array(seedBuf);
  if (seed.length !== 32) {
    throw new Error(`unwrapped seed has wrong length: ${seed.length}`);
  }
  return seed;
}

/**
 * Generate a fresh 32-byte seed using the injected RNG. Returned
 * bytes are mutable; the caller MUST treat them as secret and zero
 * them when no longer needed (we don't have a generic Uint8Array
 * `secureZero` in browser-side JS, but a single-shot use is fine
 * since we wrap-and-discard immediately).
 */
export function generateSeed(crypto: CryptoBackend): Uint8Array {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return seed;
}
