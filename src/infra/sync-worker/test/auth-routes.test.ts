/**
 * /auth/* error-path tests. The happy-path round-trip (real WebAuthn
 * registration + assertion verification) is covered by E2E tests
 * against a real browser — those test fixtures need a passkey-capable
 * authenticator and are out of scope for the worker unit suite.
 *
 * These tests focus on:
 *   - input validation (400 for malformed bodies)
 *   - state machine (404 if not registered, 401 if no challenge)
 *   - JWT round-trip via issueJwt + the /vault gate
 */

import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { issueJwt, verifyJwt } from '../src/auth';
import { writeRegistrationOnce } from '../src/registry';

const VAULT_ID = 'auth-test-vault-id-aaaa';

beforeEach(async () => {
  for (const bucket of ['VAULTS', 'REGISTRY']) {
    const list = await (env as any)[bucket].list();
    for (const obj of list.objects) await (env as any)[bucket].delete(obj.key);
  }
});

describe('/auth/register', () => {
  it('returns 400 on completely missing body', async () => {
    const r = await SELF.fetch('http://w/auth/register', { method: 'POST' });
    expect(r.status).toBe(400);
  });

  it('returns 400 on malformed JSON', async () => {
    const r = await SELF.fetch('http://w/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(r.status).toBe(400);
  });

  it('returns 400 when vaultId is missing', async () => {
    const r = await SELF.fetch('http://w/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attestation: {}, expectedChallenge: 'x' }),
    });
    expect(r.status).toBe(400);
  });

  it('returns 400 when attestation is missing', async () => {
    const r = await SELF.fetch('http://w/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID, expectedChallenge: 'x' }),
    });
    expect(r.status).toBe(400);
  });
});

describe('/auth/challenge', () => {
  it('returns 400 on missing body', async () => {
    const r = await SELF.fetch('http://w/auth/challenge', { method: 'POST' });
    expect(r.status).toBe(400);
  });

  it('returns 404 when the vault is not registered', async () => {
    const r = await SELF.fetch('http://w/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(r.status).toBe(404);
  });

  it('returns 200 + a base64url challenge once the vault is registered', async () => {
    // Bypass /auth/register by writing the registration record directly.
    // (Real registration requires a valid attestation; tested out-of-band.)
    await writeRegistrationOnce((env as any).REGISTRY, VAULT_ID, {
      credentialId: 'cred',
      publicKey: 'pk',
      counter: 0,
      registeredAt: Date.now(),
    });
    const r = await SELF.fetch('http://w/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { challenge: string; expiresAt: number };
    expect(typeof body.challenge).toBe('string');
    expect(body.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('/auth/exchange', () => {
  it('returns 400 on missing body', async () => {
    const r = await SELF.fetch('http://w/auth/exchange', { method: 'POST' });
    expect(r.status).toBe(400);
  });

  it('returns 404 when the vault is not registered', async () => {
    const r = await SELF.fetch('http://w/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId: VAULT_ID,
        assertion: {
          id: 'x',
          rawId: 'x',
          type: 'public-key',
          response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' },
        },
      }),
    });
    expect(r.status).toBe(404);
  });

  it('returns 401 when no challenge has been issued (challenge consumed)', async () => {
    await writeRegistrationOnce((env as any).REGISTRY, VAULT_ID, {
      credentialId: 'cred',
      publicKey: 'pk',
      counter: 0,
      registeredAt: Date.now(),
    });
    const r = await SELF.fetch('http://w/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId: VAULT_ID,
        assertion: {
          id: 'x',
          rawId: 'x',
          type: 'public-key',
          response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' },
        },
      }),
    });
    expect(r.status).toBe(401);
  });
});

describe('JWT issuance helpers', () => {
  it('issueJwt → verifyJwt round-trip succeeds with the right secret', async () => {
    const secret = (env as any).JWT_SECRET;
    const issuer = (env as any).JWT_ISSUER;
    const tok = await issueJwt(VAULT_ID, secret, issuer);
    const claims = await verifyJwt(tok, secret, issuer);
    expect(claims.sub).toBe(VAULT_ID);
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it('verifyJwt rejects a token signed with the wrong secret', async () => {
    const issuer = (env as any).JWT_ISSUER;
    const tok = await issueJwt(VAULT_ID, 'wrong-secret-32-chars-or-more-aaaa', issuer);
    await expect(
      verifyJwt(tok, (env as any).JWT_SECRET, issuer),
    ).rejects.toBeTruthy();
  });

  it('verifyJwt rejects a token with the wrong issuer', async () => {
    const secret = (env as any).JWT_SECRET;
    const tok = await issueJwt(VAULT_ID, secret, 'wrong-issuer');
    await expect(
      verifyJwt(tok, secret, (env as any).JWT_ISSUER),
    ).rejects.toBeTruthy();
  });

  it('verifyJwt rejects an expired token', async () => {
    const secret = (env as any).JWT_SECRET;
    const issuer = (env as any).JWT_ISSUER;
    // ttlSecs = -1 → the token is already expired the moment it's issued
    const tok = await issueJwt(VAULT_ID, secret, issuer, -1);
    await expect(verifyJwt(tok, secret, issuer)).rejects.toBeTruthy();
  });
});
