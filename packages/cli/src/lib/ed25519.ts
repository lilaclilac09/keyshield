/**
 * Tiny ed25519 + base58 helpers built on Node's crypto module.
 *
 * Why no @solana/web3.js: that package is ~MB and pulls in dozens of
 * transitive deps. The CLI only needs four primitives (gen keypair,
 * sign, encode pubkey for the server, decode sig for the agent-login
 * call). All of them are one-liners against `node:crypto`.
 *
 * The wire format the v2-mvp server speaks:
 *   - agentPubkey: base58, 32 raw pubkey bytes (Solana convention)
 *   - signature:   base64, 64 raw signature bytes
 */

import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
  type KeyObject,
} from 'node:crypto';

// ─── ed25519 keypair ────────────────────────────────────────────────────────

export interface KeyPair {
  /** 32 raw pubkey bytes. */
  publicKey: Uint8Array;
  /** 32 raw secret seed bytes (the part you keep). */
  secretKey: Uint8Array;
}

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: extractRawPublicKey(publicKey),
    secretKey: extractRawSecretSeed(privateKey),
  };
}

/**
 * Sign with a raw 32-byte ed25519 secret seed. Returns 64 raw sig
 * bytes, ready to base64 for /auth/agent-login.
 */
export function sign(message: Uint8Array, secretSeed: Uint8Array): Uint8Array {
  if (secretSeed.length !== 32) {
    throw new Error(`secret seed must be 32 bytes (got ${secretSeed.length})`);
  }
  // Wrap the raw seed in a PKCS#8 DER envelope so node:crypto accepts it.
  const der = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    secretSeed,
  ]);
  const key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const sig = nodeSign(null, Buffer.from(message), key);
  return new Uint8Array(sig);
}

function extractRawPublicKey(k: KeyObject): Uint8Array {
  // SPKI DER for ed25519 is a fixed 12-byte prefix + 32-byte pubkey.
  const der = k.export({ format: 'der', type: 'spki' });
  if (der.length !== 44) {
    throw new Error(`unexpected ed25519 SPKI length: ${der.length}`);
  }
  return new Uint8Array(der.subarray(12));
}

function extractRawSecretSeed(k: KeyObject): Uint8Array {
  // PKCS#8 DER for ed25519 is a fixed 16-byte prefix + 32-byte seed.
  const der = k.export({ format: 'der', type: 'pkcs8' });
  if (der.length !== 48) {
    throw new Error(`unexpected ed25519 PKCS#8 length: ${der.length}`);
  }
  return new Uint8Array(der.subarray(16));
}

// ─── base58 (Bitcoin / Solana alphabet) ─────────────────────────────────────

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = (() => {
  const m = new Int8Array(128).fill(-1);
  for (let i = 0; i < BASE58_ALPHABET.length; i++) {
    m[BASE58_ALPHABET.charCodeAt(i)] = i;
  }
  return m;
})();

/**
 * Bitcoin / Solana base58. We encode small fixed-size buffers (32-byte
 * pubkeys), so the naive divide-by-58 loop is plenty fast.
 */
export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  // Count leading zero bytes — they become leading '1's in base58.
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  // Treat the buffer as a big-endian integer; repeatedly divmod 58.
  const digits: number[] = [];
  const buf = Array.from(bytes);
  let start = zeros;
  while (start < buf.length) {
    let carry = 0;
    for (let i = start; i < buf.length; i++) {
      const v = (carry << 8) + buf[i];
      buf[i] = (v / 58) | 0;
      carry = v % 58;
    }
    digits.push(carry);
    while (start < buf.length && buf[start] === 0) start++;
  }

  let out = '';
  for (let i = 0; i < zeros; i++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}

export function base58Decode(s: string): Uint8Array {
  if (s.length === 0) return new Uint8Array();
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;

  const out: number[] = [];
  for (let i = zeros; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const idx = c < 128 ? BASE58_INDEX[c] : -1;
    if (idx < 0) throw new Error(`invalid base58 character at position ${i}: ${s[i]}`);
    let carry = idx;
    for (let j = 0; j < out.length; j++) {
      carry += out[j] * 58;
      out[j] = carry & 0xff;
      carry >>>= 8;
    }
    while (carry > 0) {
      out.push(carry & 0xff);
      carry >>>= 8;
    }
  }
  const result = new Uint8Array(zeros + out.length);
  for (let i = 0; i < out.length; i++) result[zeros + (out.length - 1 - i)] = out[i];
  return result;
}

// ─── base64 (used for signatures over the wire) ─────────────────────────────

export function base64Encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
