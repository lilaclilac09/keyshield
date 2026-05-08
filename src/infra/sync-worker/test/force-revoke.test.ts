/**
 * Tests for the new POST /auth/revoke-challenge + /auth/force-revoke
 * routes. These exercise the seed-bound revocation path: a user with
 * the 24-word recovery phrase but no passkey can drop the vault's
 * passkey registration server-side.
 */

import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { writeRegistrationOnce } from '../src/registry';

const VAULT_ID = 'force-revoke-vault-id-cccc';

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeKeypair(seedByte = 0xab) {
  const privateKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) privateKey[i] = (seedByte + i) & 0xff;
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

beforeEach(async () => {
  for (const bucket of ['VAULTS', 'REGISTRY']) {
    const list = await (env as any)[bucket].list();
    for (const obj of list.objects) await (env as any)[bucket].delete(obj.key);
  }
});

async function seedRegistration(seedPublicKey?: string) {
  await writeRegistrationOnce((env as any).REGISTRY, VAULT_ID, {
    credentialId: 'cred',
    publicKey: 'pk',
    counter: 0,
    registeredAt: Date.now(),
    ...(seedPublicKey ? { seedPublicKey } : {}),
  });
}

describe('POST /auth/revoke-challenge', () => {
  it('returns 404 if the vault is not registered', async () => {
    const r = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(r.status).toBe(404);
  });

  it('returns 404 if the vault has no seed-bound revoke key', async () => {
    await seedRegistration();
    const r = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(r.status).toBe(404);
  });

  it('returns a fresh challenge when the vault HAS a seed pubkey', async () => {
    const { publicKey } = makeKeypair();
    await seedRegistration(bytesToBase64Url(publicKey));
    const r = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      challenge: string;
      expiresAt: number;
    };
    expect(body.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it('returns 400 on a missing vaultId', async () => {
    const r = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });
});

describe('POST /auth/force-revoke', () => {
  it('drops the registration when the signature is valid', async () => {
    const { privateKey, publicKey } = makeKeypair();
    await seedRegistration(bytesToBase64Url(publicKey));

    const chRes = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    const { challenge } = (await chRes.json()) as { challenge: string };

    const sig = ed25519.sign(new TextEncoder().encode(challenge), privateKey);

    const r = await SELF.fetch('http://w/auth/force-revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId: VAULT_ID,
        challenge,
        signature: bytesToBase64Url(sig),
      }),
    });
    expect(r.status).toBe(200);

    const obj = await (env as any).REGISTRY.get(VAULT_ID);
    expect(obj).toBeNull();
  });

  it('rejects 401 when no challenge has been issued', async () => {
    const { privateKey, publicKey } = makeKeypair();
    await seedRegistration(bytesToBase64Url(publicKey));
    const challenge = 'not-actually-issued-by-server';
    const sig = ed25519.sign(new TextEncoder().encode(challenge), privateKey);
    const r = await SELF.fetch('http://w/auth/force-revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId: VAULT_ID,
        challenge,
        signature: bytesToBase64Url(sig),
      }),
    });
    expect(r.status).toBe(401);
  });

  it('rejects 401 when the challenge in the body does not match', async () => {
    const { privateKey, publicKey } = makeKeypair();
    await seedRegistration(bytesToBase64Url(publicKey));
    const chRes = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    await chRes.json(); // consume the issued challenge
    // Reissue another so the consumeRevokeChallenge call returns
    // the SECOND challenge — but the body sends a different (first)
    // challenge string, and the server should reject.
    const ch2Res = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    await ch2Res.json();
    const wrong = 'a-different-challenge';
    const sig = ed25519.sign(new TextEncoder().encode(wrong), privateKey);
    const r = await SELF.fetch('http://w/auth/force-revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId: VAULT_ID,
        challenge: wrong,
        signature: bytesToBase64Url(sig),
      }),
    });
    expect(r.status).toBe(401);
  });

  it('rejects 401 when the signature is from a different key', async () => {
    const { publicKey } = makeKeypair();
    const { privateKey: wrongKey } = makeKeypair(0x77);
    await seedRegistration(bytesToBase64Url(publicKey));
    const chRes = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    const { challenge } = (await chRes.json()) as { challenge: string };
    const sig = ed25519.sign(new TextEncoder().encode(challenge), wrongKey);
    const r = await SELF.fetch('http://w/auth/force-revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId: VAULT_ID,
        challenge,
        signature: bytesToBase64Url(sig),
      }),
    });
    expect(r.status).toBe(401);
  });

  it('returns 404 if the vault has no seed pubkey on file', async () => {
    await seedRegistration();
    const challenge = 'any-string';
    const fakeSig = new Uint8Array(64);
    const r = await SELF.fetch('http://w/auth/force-revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId: VAULT_ID,
        challenge,
        signature: bytesToBase64Url(fakeSig),
      }),
    });
    expect(r.status).toBe(404);
  });

  it('after force-revoke succeeds, /auth/revoke-challenge 404s (registration is gone)', async () => {
    const { privateKey, publicKey } = makeKeypair();
    await seedRegistration(bytesToBase64Url(publicKey));
    const chRes = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    const { challenge } = (await chRes.json()) as { challenge: string };
    const sig = ed25519.sign(new TextEncoder().encode(challenge), privateKey);
    const ok = await SELF.fetch('http://w/auth/force-revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId: VAULT_ID,
        challenge,
        signature: bytesToBase64Url(sig),
      }),
    });
    expect(ok.status).toBe(200);

    const second = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(second.status).toBe(404);
  });

  it('rejects 400 on malformed signature length', async () => {
    const { publicKey } = makeKeypair();
    await seedRegistration(bytesToBase64Url(publicKey));
    const chRes = await SELF.fetch('http://w/auth/revoke-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    const { challenge } = (await chRes.json()) as { challenge: string };
    const r = await SELF.fetch('http://w/auth/force-revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId: VAULT_ID,
        challenge,
        signature: bytesToBase64Url(new Uint8Array(50)),
      }),
    });
    expect(r.status).toBe(400);
  });
});

// Driving the seedPublicKey-validation path through /auth/register
// requires a real WebAuthn attestation, which the rest of the suite
// also doesn't simulate. Trust @simplewebauthn/server's own tests
// for the attestation-verifies branch; the seedPublicKey shape check
// is a narrow z.string() + 32-byte length assertion exercised by
// hand-running `npm run typecheck` + the unit-level @noble round-trips
// in extension-sync's seed-revoke.test.ts.
