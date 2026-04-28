/**
 * Tests for the GET /vault/:id ETag + If-None-Match conditional path.
 *
 * The "warm-cache" agent loop is the use case: an agent that already
 * has the cipher pulls every N seconds to check for cross-device
 * edits. With ETag, ~99% of those round trips return 304 (empty body)
 * instead of re-streaming the full ciphertext.
 */

import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { issueJwt } from '../src/auth';

const VAULT_ID = 'etag-vault-id-aaaaaa';

const VAULT_BODY = {
  version: 1,
  iv: 'AAAAAAAA',
  ciphertext: 'BBBBBBBB',
  updatedAt: 1,
};

beforeEach(async () => {
  for (const bucket of ['VAULTS', 'REGISTRY']) {
    const list = await (env as any)[bucket].list();
    for (const obj of list.objects) await (env as any)[bucket].delete(obj.key);
  }
});

async function tokenFor(vaultId: string) {
  return issueJwt(
    vaultId,
    (env as any).JWT_SECRET,
    (env as any).JWT_ISSUER,
  );
}

async function putVault(token: string, body = VAULT_BODY) {
  return SELF.fetch(`http://w/vault/${VAULT_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe('GET /vault/:id — ETag + Cache-Control', () => {
  it('200 includes an ETag header and Cache-Control: private', async () => {
    const token = await tokenFor(VAULT_ID);
    expect((await putVault(token)).status).toBe(200);

    const res = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toMatch(/^".+"$/);
    expect(res.headers.get('Cache-Control')).toContain('private');
    expect(res.headers.get('Cache-Control')).toContain('max-age=10');
  });

  it('returns 304 when If-None-Match matches the current ETag', async () => {
    const token = await tokenFor(VAULT_ID);
    await putVault(token);

    const first = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const etag = first.headers.get('ETag')!;
    expect(etag).toBeTruthy();

    const second = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'If-None-Match': etag,
      },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
    expect(second.headers.get('Cache-Control')).toContain('private');
    // 304 must have no body.
    expect(await second.text()).toBe('');
  });

  it('returns 200 with a NEW ETag when the cipher changed since', async () => {
    const token = await tokenFor(VAULT_ID);
    await putVault(token, { ...VAULT_BODY, updatedAt: 1 });

    const first = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const oldEtag = first.headers.get('ETag')!;

    // Mutate the vault.
    await putVault(token, { ...VAULT_BODY, updatedAt: 2, ciphertext: 'CCCCCCCC' });

    const second = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'If-None-Match': oldEtag,
      },
    });
    expect(second.status).toBe(200);
    const newEtag = second.headers.get('ETag');
    expect(newEtag).not.toBe(oldEtag);
    expect(newEtag).toMatch(/^".+"$/);
  });

  it('returns 404 when If-None-Match is sent for a missing vault', async () => {
    const token = await tokenFor(VAULT_ID);
    const res = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'If-None-Match': '"nonexistent"',
      },
    });
    expect(res.status).toBe(404);
  });

  it('honors If-None-Match: * as a "match anything that exists" sentinel', async () => {
    const token = await tokenFor(VAULT_ID);
    await putVault(token);

    const res = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'If-None-Match': '*',
      },
    });
    expect(res.status).toBe(304);
  });

  it('handles weak validators (W/"...") in If-None-Match', async () => {
    const token = await tokenFor(VAULT_ID);
    await putVault(token);

    const first = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const etag = first.headers.get('ETag')!.replace(/^"/, 'W/"');

    const second = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'If-None-Match': etag,
      },
    });
    expect(second.status).toBe(304);
  });

  it('handles a comma-separated list of candidate etags', async () => {
    const token = await tokenFor(VAULT_ID);
    await putVault(token);

    const first = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const etag = first.headers.get('ETag')!;

    const second = await SELF.fetch(`http://w/vault/${VAULT_ID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'If-None-Match': `"stale1", ${etag}, "stale2"`,
      },
    });
    expect(second.status).toBe(304);
  });
});
