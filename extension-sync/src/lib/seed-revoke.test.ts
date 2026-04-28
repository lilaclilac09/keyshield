import { describe, it, expect } from 'vitest';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  deriveRevokeKeypair,
  signRevokeChallenge,
  verifyRevokeSignature,
} from './seed-revoke';

function fixedSeed(): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = i;
  return out;
}

describe('deriveRevokeKeypair', () => {
  it('rejects seeds that are not 32 bytes', () => {
    expect(() => deriveRevokeKeypair(new Uint8Array(31))).toThrow();
    expect(() => deriveRevokeKeypair(new Uint8Array(64))).toThrow();
  });

  it('is deterministic — same seed produces the same keypair', () => {
    const a = deriveRevokeKeypair(fixedSeed());
    const b = deriveRevokeKeypair(fixedSeed());
    expect(Array.from(a.publicKey)).toEqual(Array.from(b.publicKey));
    expect(Array.from(a.privateKey)).toEqual(Array.from(b.privateKey));
  });

  it('different seeds produce different public keys', () => {
    const a = deriveRevokeKeypair(fixedSeed());
    const seed2 = fixedSeed();
    seed2[0] ^= 0xff;
    const b = deriveRevokeKeypair(seed2);
    expect(Array.from(a.publicKey)).not.toEqual(Array.from(b.publicKey));
  });

  it('produces 32-byte public key and 32-byte private key', () => {
    const kp = deriveRevokeKeypair(fixedSeed());
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
  });
});

describe('signRevokeChallenge / verifyRevokeSignature', () => {
  const challenge = 'AbCd-1234_xyz';

  it('signs and verifies a 64-byte signature', () => {
    const kp = deriveRevokeKeypair(fixedSeed());
    const sig = signRevokeChallenge(challenge, kp.privateKey);
    expect(sig.length).toBe(64);
    expect(verifyRevokeSignature(challenge, sig, kp.publicKey)).toBe(true);
  });

  it('rejects a signature from a different seed', () => {
    const kpA = deriveRevokeKeypair(fixedSeed());
    const seedB = fixedSeed();
    seedB[31] ^= 0xff;
    const kpB = deriveRevokeKeypair(seedB);
    const sigA = signRevokeChallenge(challenge, kpA.privateKey);
    expect(verifyRevokeSignature(challenge, sigA, kpB.publicKey)).toBe(false);
  });

  it('rejects a signature against a tampered challenge', () => {
    const kp = deriveRevokeKeypair(fixedSeed());
    const sig = signRevokeChallenge(challenge, kp.privateKey);
    expect(
      verifyRevokeSignature(challenge + 'X', sig, kp.publicKey),
    ).toBe(false);
  });

  it('rejects a malformed signature', () => {
    const kp = deriveRevokeKeypair(fixedSeed());
    expect(
      verifyRevokeSignature(challenge, new Uint8Array(63), kp.publicKey),
    ).toBe(false);
    expect(
      verifyRevokeSignature(challenge, new Uint8Array(64), kp.publicKey),
    ).toBe(false);
  });

  it('rejects a malformed public key', () => {
    const kp = deriveRevokeKeypair(fixedSeed());
    const sig = signRevokeChallenge(challenge, kp.privateKey);
    expect(verifyRevokeSignature(challenge, sig, new Uint8Array(31))).toBe(
      false,
    );
  });
});

describe('base64url helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const buf = new Uint8Array(64);
    for (let i = 0; i < 64; i++) buf[i] = (i * 37) & 0xff;
    expect(Array.from(base64UrlToBytes(bytesToBase64Url(buf)))).toEqual(
      Array.from(buf),
    );
  });

  it('uses URL-safe alphabet (no +, /, =)', () => {
    const buf = new Uint8Array([255, 254, 253, 252, 251, 0, 1, 2]);
    const enc = bytesToBase64Url(buf);
    expect(enc).not.toMatch(/[+/=]/);
  });

  it('handles non-aligned lengths', () => {
    const buf = new Uint8Array([1, 2, 3]);
    const enc = bytesToBase64Url(buf);
    expect(Array.from(base64UrlToBytes(enc))).toEqual([1, 2, 3]);
  });
});
