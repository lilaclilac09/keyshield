/**
 * Seed-derived Ed25519 keypair for server-side passkey revocation.
 *
 * Lets a recovery-phrase-only user (think: phone got stolen, no
 * passkey yet on a new device) prove ownership of the vault to the
 * sync backend WITHOUT a passkey, and revoke registrations for every
 * passkey that's currently bound to it. The lost device cannot keep
 * authenticating after this.
 *
 * Trust model:
 *   - The seed is the long-term root. Anyone holding the 24-word
 *     phrase can unwrap the seed; anyone with the seed can sign.
 *   - The Ed25519 private key is HKDF-derived from the seed with a
 *     domain-separated info string, so it never collides with the
 *     vault's encryption key or the seed-wrap key.
 *   - The PUBLIC key is registered alongside each passkey in the
 *     sync backend's REGISTRY. Any device holding the seed can
 *     produce signatures that match this pubkey on every other
 *     device's record.
 *
 *   info = 'keyshield-prf-v1:revoke-key'
 *
 * Wire format:
 *   - Public key on the wire is base64url(32 bytes).
 *   - Signature on the wire is base64url(64 bytes).
 *   - Challenge bytes are the UTF-8 encoding of the worker-issued
 *     challenge string (already random base64url from the server's
 *     side).
 */

import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { ed25519 } from '@noble/curves/ed25519';

const HKDF_INFO = 'keyshield-prf-v1:revoke-key';

export interface RevokeKeypair {
  publicKey: Uint8Array; // 32 bytes
  privateKey: Uint8Array; // 32 bytes (Ed25519 seed)
}

/**
 * Derive the deterministic Ed25519 keypair from a 32-byte vault seed.
 * Same seed → same keypair on every device, every time.
 */
export function deriveRevokeKeypair(seed: Uint8Array): RevokeKeypair {
  if (seed.length !== 32) {
    throw new Error(`seed must be 32 bytes, got ${seed.length}`);
  }
  const privateKey = hkdf(
    sha256,
    seed,
    new Uint8Array(),
    new TextEncoder().encode(HKDF_INFO),
    32,
  );
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/** Sign a challenge with the seed-derived private key. Returns 64 raw bytes. */
export function signRevokeChallenge(
  challenge: string,
  privateKey: Uint8Array,
): Uint8Array {
  if (privateKey.length !== 32) {
    throw new Error(`private key must be 32 bytes, got ${privateKey.length}`);
  }
  const message = new TextEncoder().encode(challenge);
  return ed25519.sign(message, privateKey);
}

/** Verify a signature server-side. */
export function verifyRevokeSignature(
  challenge: string,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== 64) return false;
  if (publicKey.length !== 32) return false;
  const message = new TextEncoder().encode(challenge);
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

// ==================== base64url helpers ====================

export function bytesToBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  const padded =
    b64url.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (b64url.length % 4)) % 4);
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }
  const s = atob(padded);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
