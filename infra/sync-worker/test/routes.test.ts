/**
 * End-to-end tests for the sync-worker routes. We run inside a real
 * workerd runtime via @cloudflare/vitest-pool-workers, so the R2
 * binding behaves like production.
 */

import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { issueJwtForTest } from '../src/auth';

const VAULT_ID = 'test-vault-abc123';

interface VaultCipher {
  version: number;
  iv: string;
  ciphertext: string;
  updatedAt: number;
}
function makeCipher(updatedAt: number): VaultCipher {
  return {
    version: 1,
    iv: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'YmFzZTY0Y2lwaGVy',
    updatedAt,
  };
}

async function tokenFor(vaultId: string): Promise<string> {
  return issueJwtForTest(
    vaultId,
    (env as any).JWT_SECRET,
    (env as any).JWT_ISSUER,
  );
}

beforeEach(async () => {
  // Wipe both buckets between tests so vault state doesn't leak.
  const list = await (env as any).VAULTS.list();
  for (const obj of list.objects) await (env as any).VAULTS.delete(obj.key);
});

describe('GET /health', () => {
  it('returns 200', async () => {
    const r = await SELF.fetch('http://w/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /vault/:id', () => {
  it('returns 401 without a bearer token', async () => {
    const r = await SELF.fetch(`http://w/vault/${VAULT_ID}`);
    expect(r.status).toBe(401);
  });

  it('returns 401 with a bogus token', async () => {
    const r = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: 'Bearer not-a-jwt' },
    });
    expect(r.status).toBe(401);
  });

  it('returns 403 when the JWT sub does not match :id', async () => {
    const token = await tokenFor('different-vault-id');
    const r = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(403);
  });

  it('returns 404 when the vault has not been pushed yet', async () => {
    const token = await tokenFor(VAULT_ID);
    const r = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(404);
  });
});

describe('PUT /vault/:id', () => {
  it('round-trips a cipher when authorized', async () => {
    const token = await tokenFor(VAULT_ID);
    const cipher = makeCipher(100);

    const put = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cipher),
    });
    expect(put.status).toBe(200);

    const get = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual(cipher);
  });

  it('returns 409 on stale write (older updatedAt than stored)', async () => {
    const token = await tokenFor(VAULT_ID);
    await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(makeCipher(100)),
    });
    const stale = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(makeCipher(99)),
    });
    expect(stale.status).toBe(409);
  });

  it('treats equal-updatedAt as stale', async () => {
    const token = await tokenFor(VAULT_ID);
    await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(makeCipher(100)),
    });
    const dup = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(makeCipher(100)),
    });
    expect(dup.status).toBe(409);
  });

  it('returns 400 for malformed JSON', async () => {
    const token = await tokenFor(VAULT_ID);
    const r = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(r.status).toBe(400);
  });

  it('returns 400 for valid JSON of wrong shape', async () => {
    const token = await tokenFor(VAULT_ID);
    const r = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ unrelated: 'object' }),
    });
    expect(r.status).toBe(400);
  });

  it('returns 413 when body exceeds MAX_VAULT_BYTES', async () => {
    const token = await tokenFor(VAULT_ID);
    // MAX_VAULT_BYTES is 4096 in the vitest config.
    const huge = makeCipher(1);
    huge.ciphertext = 'A'.repeat(5000);
    const r = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(huge),
    });
    expect(r.status).toBe(413);
  });

  it('returns 401 without a bearer token', async () => {
    const r = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeCipher(100)),
    });
    expect(r.status).toBe(401);
  });
});

describe('DELETE /vault/:id', () => {
  it('removes a stored vault and subsequent GET returns 404', async () => {
    const token = await tokenFor(VAULT_ID);
    await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(makeCipher(100)),
    });
    const del = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(del.status).toBe(204);
    const get = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(get.status).toBe(404);
  });

  it('idempotent on a vault that was never pushed', async () => {
    const token = await tokenFor(VAULT_ID);
    const r = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(204);
  });

  it('returns 403 when the JWT sub does not match', async () => {
    const token = await tokenFor('other-id');
    const r = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(403);
  });
});

describe('vault isolation', () => {
  it('different IDs cannot read each other', async () => {
    const tokenA = await tokenFor('vault-A');
    const tokenB = await tokenFor('vault-B');
    await SELF.fetch('http://w/vault/vault-A', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(makeCipher(100)),
    });
    const getB = await SELF.fetch('http://w/vault/vault-B', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(getB.status).toBe(404);
  });
});
