/**
 * Tests for the new POST /auth/revoke route.
 *
 * Like the other auth-routes tests, we don't drive a full WebAuthn
 * registration — we seed REGISTRY directly via writeRegistrationOnce
 * and mint JWTs via issueJwt. Happy-path WebAuthn is covered by
 * @simplewebauthn/server's own suite.
 */

import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { issueJwt } from '../src/auth';
import { writeRegistrationOnce } from '../src/registry';

const VAULT_ID = 'revoke-test-vault-id-bbbb';

beforeEach(async () => {
  for (const bucket of ['VAULTS', 'REGISTRY']) {
    const list = await (env as any)[bucket].list();
    for (const obj of list.objects) await (env as any)[bucket].delete(obj.key);
  }
  await writeRegistrationOnce((env as any).REGISTRY, VAULT_ID, {
    credentialId: 'cred',
    publicKey: 'pk',
    counter: 0,
    registeredAt: Date.now(),
  });
});

async function tokenFor(vaultId: string) {
  return issueJwt(
    vaultId,
    (env as any).JWT_SECRET,
    (env as any).JWT_ISSUER,
  );
}

describe('POST /auth/revoke', () => {
  it('returns 401 without a bearer token', async () => {
    const r = await SELF.fetch('http://w/auth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(r.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const r = await SELF.fetch('http://w/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer not-a-jwt',
      },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(r.status).toBe(401);
  });

  it('returns 400 on missing body', async () => {
    const token = await tokenFor(VAULT_ID);
    const r = await SELF.fetch('http://w/auth/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(400);
  });

  it('returns 403 when the JWT sub does not match the body vaultId', async () => {
    const token = await tokenFor('different-vault-id');
    const r = await SELF.fetch('http://w/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(r.status).toBe(403);
  });

  it('on success: REGISTRY/<vaultId> is deleted', async () => {
    const token = await tokenFor(VAULT_ID);
    const r = await SELF.fetch('http://w/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(r.status).toBe(200);
    const obj = await (env as any).REGISTRY.get(VAULT_ID);
    expect(obj).toBeNull();
  });

  it('also deletes the pending challenge alongside the registration', async () => {
    await (env as any).REGISTRY.put(
      `${VAULT_ID}-challenge`,
      JSON.stringify({ challenge: 'abc', expiresAt: Date.now() + 60000 }),
    );
    const token = await tokenFor(VAULT_ID);
    await SELF.fetch('http://w/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    const ch = await (env as any).REGISTRY.get(`${VAULT_ID}-challenge`);
    expect(ch).toBeNull();
  });

  it('does NOT delete the vault ciphertext (push a vault via the worker, then revoke)', async () => {
    const token = await tokenFor(VAULT_ID);
    // Push a vault through the worker so storage isolation tracks it.
    const putRes = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        version: 1,
        iv: 'AAAA',
        ciphertext: 'BBBB',
        updatedAt: 1,
      }),
    });
    expect(putRes.status).toBe(200);

    // Revoke.
    const rev = await SELF.fetch('http://w/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(rev.status).toBe(200);

    // The vault GET will now 401 (registration deleted, JWT we hold
    // is still locally valid but the vault gate doesn't care — it
    // just checks JWT.sub == :id, which still passes). The cipher
    // is still readable. We assert via a fresh GET.
    const get = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { ciphertext: string };
    expect(body.ciphertext).toBe('BBBB');
  });

  it('subsequent /auth/exchange for the same vaultId 404s after revoke', async () => {
    const token = await tokenFor(VAULT_ID);
    const rev = await SELF.fetch('http://w/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ vaultId: VAULT_ID }),
    });
    expect(rev.status).toBe(200);
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
});
