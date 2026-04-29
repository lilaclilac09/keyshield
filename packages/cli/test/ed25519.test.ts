/**
 * Self-contained tests for the tiny ed25519 + base58 helpers.
 * The point is to prove we don't need @solana/web3.js for the
 * three things the CLI does (gen, sign, encode/decode pubkey).
 */

import { describe, it, expect } from 'vitest';
import { createPublicKey, verify as nodeVerify } from 'node:crypto';
import {
  generateKeyPair,
  sign,
  base58Encode,
  base58Decode,
  base64Encode,
} from '../src/lib/ed25519.js';

describe('generateKeyPair', () => {
  it('returns 32-byte public + secret', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey).toBeInstanceOf(Uint8Array);
    expect(kp.secretKey.length).toBe(32);
  });

  it('produces different material on each call', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(Buffer.from(a.publicKey).equals(Buffer.from(b.publicKey))).toBe(false);
  });
});

describe('sign', () => {
  it('round-trips: signature verifies under the matching pubkey', () => {
    const kp = generateKeyPair();
    const msg = new TextEncoder().encode('hello world');
    const sig = sign(msg, kp.secretKey);
    expect(sig.length).toBe(64);

    // Re-derive the SPKI DER for verification via node:crypto.
    const spki = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(kp.publicKey),
    ]);
    const pubKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    const ok = nodeVerify(null, Buffer.from(msg), pubKey, Buffer.from(sig));
    expect(ok).toBe(true);
  });

  it('signature does NOT verify under a different pubkey', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const msg = new TextEncoder().encode('hello');
    const sig = sign(msg, a.secretKey);

    const spki = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(b.publicKey),
    ]);
    const pubKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    expect(nodeVerify(null, Buffer.from(msg), pubKey, Buffer.from(sig))).toBe(false);
  });

  it('rejects a non-32-byte secret seed', () => {
    expect(() => sign(new Uint8Array([1, 2, 3]), new Uint8Array(31))).toThrow();
  });
});

describe('base58 encode/decode', () => {
  it('round-trips arbitrary bytes', () => {
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([0, 0, 0]),
      new Uint8Array([1, 2, 3, 4]),
      new Uint8Array([0, 0, 1, 2, 3]), // leading zeros
      new Uint8Array(32).map((_, i) => (i * 7 + 1) & 0xff), // a 32-byte case
    ];
    for (const buf of cases) {
      const round = base58Decode(base58Encode(buf));
      expect(Buffer.from(round).equals(Buffer.from(buf))).toBe(true);
    }
  });

  it('encodes a known Solana-style 32-byte pubkey to ~44 chars', () => {
    const kp = generateKeyPair();
    const s = base58Encode(kp.publicKey);
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(s.length).toBeLessThanOrEqual(50);
    expect(s).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it('decode rejects invalid base58 chars', () => {
    expect(() => base58Decode('OIl0')).toThrow(/invalid base58/i);
  });

  it('"1" decodes to a single zero byte (leading-zero behaviour)', () => {
    expect(Array.from(base58Decode('1'))).toEqual([0]);
    expect(Array.from(base58Decode('11'))).toEqual([0, 0]);
  });
});

describe('base64Encode', () => {
  it('matches Buffer.from(...).toString("base64")', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 0xff, 0xfe]);
    expect(base64Encode(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
