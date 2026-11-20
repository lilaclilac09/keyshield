import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { issueJwtForTest } from '../src/auth';
import { readVaultWithEtag } from '../src/cas';

const ID = 'whole-vault-tombstone-test';
const cipher = (updatedAt: number) => ({ version: 1, iv: 'opaque-iv', ciphertext: `opaque-cipher-${updatedAt}`, updatedAt });
let token: string;

function mutation(method: 'PUT' | 'DELETE', base?: string, revision = 101) {
  return new Request(`http://w/vault/${ID}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(base === undefined ? {} : { 'X-Vault-Base-Revision': base }),
      'Content-Type': 'application/json',
    },
    ...(method === 'PUT' ? { body: JSON.stringify(cipher(revision)) } : {}),
  });
}

beforeEach(async () => {
  await (env as any).VAULTS.delete(ID);
  token = await issueJwtForTest(ID, (env as any).JWT_SECRET, (env as any).JWT_ISSUER);
});

describe('atomic whole-vault tombstones', () => {
  it('rejects stale DELETE without changing newer ciphertext', async () => {
    await (env as any).VAULTS.put(ID, JSON.stringify(cipher(101)));
    const res = await SELF.fetch(mutation('DELETE', '100'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'vault changed — nothing was deleted, reload' });
    expect(await (await (env as any).VAULTS.get(ID)).json()).toEqual(cipher(101));
  });

  it('rejects DELETE if a real route PUT wins between its read and conditional put', async () => {
    let stored = { body: cipher(100), etag: 'original' };
    const bucket = {
      get: vi.fn(async () => {
        const snapshot = stored;
        return { etag: snapshot.etag, json: async () => snapshot.body };
      }),
      put: vi.fn(async (_id: string, text: string, options: R2PutOptions) => {
        const body = JSON.parse(text);
        expect(options.onlyIf).toEqual({ etagMatches: 'original' });
        if (body.deleted) {
          const save = await app.fetch(mutation('PUT', '100', 101), { ...env, VAULTS: bucket } as any);
          expect(save.status).toBe(200);
        }
        if ((options.onlyIf as R2Conditional).etagMatches !== stored.etag) return null;
        stored = { body, etag: 'new-save' };
        return { etag: stored.etag };
      }),
      delete: vi.fn(),
    };
    const res = await app.fetch(mutation('DELETE', '100'), { ...env, VAULTS: bucket } as any);
    expect(res.status).toBe(409);
    expect(stored.body).toEqual(cipher(101));
    expect(bucket.put).toHaveBeenCalledTimes(2);
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it('stores a ciphertext-free tombstone and returns 404 to old and conditional GETs', async () => {
    await (env as any).VAULTS.put(ID, JSON.stringify(cipher(100)));
    expect((await SELF.fetch(mutation('DELETE', '100'))).status).toBe(204);
    const object = await (env as any).VAULTS.get(ID);
    expect(await object.json()).toEqual({ deleted: true, deletedAt: expect.any(Number), revision: 100 });
    expect(await readVaultWithEtag((env as any).VAULTS, ID)).toEqual({ cipher: null, etag: object.etag, tombstone: true });
    for (const validator of [undefined, '*', `"${object.etag}"`]) {
      const read = await SELF.fetch(`http://w/vault/${ID}`, {
        headers: { Authorization: `Bearer ${token}`, ...(validator ? { 'If-None-Match': validator } : {}) },
      });
      expect(read.status).toBe(404);
      expect(await read.json()).toEqual({ error: 'not found' });
    }
  });

  it('allows recreation only with none and conditionally replaces the tombstone', async () => {
    await (env as any).VAULTS.put(ID, JSON.stringify(cipher(100)));
    await SELF.fetch(mutation('DELETE', '100'));
    const marker = await (env as any).VAULTS.head(ID);
    expect((await SELF.fetch(mutation('PUT', '100'))).status).toBe(409);
    expect((await (env as any).VAULTS.head(ID)).etag).toBe(marker.etag);
    expect((await SELF.fetch(mutation('PUT', 'none'))).status).toBe(200);
    expect(await (await (env as any).VAULTS.get(ID)).json()).toEqual(cipher(101));
  });

  it('makes absent/tombstoned DELETE idempotent for any valid base without rewriting', async () => {
    expect((await SELF.fetch(mutation('DELETE', '100'))).status).toBe(204);
    expect(await (env as any).VAULTS.get(ID)).toBeNull();
    await (env as any).VAULTS.put(ID, JSON.stringify({ deleted: true, deletedAt: 1, revision: 100 }));
    const marker = await (env as any).VAULTS.head(ID);
    for (const base of ['none', '99', '100']) {
      expect((await SELF.fetch(mutation('DELETE', base))).status).toBe(204);
      expect((await (env as any).VAULTS.head(ID)).etag).toBe(marker.etag);
    }
    expect((await SELF.fetch(mutation('DELETE'))).status).toBe(428);
    expect((await (env as any).VAULTS.head(ID)).etag).toBe(marker.etag);
  });

  it.each(['invalid-json', '{"unrelated":true}', '{"deleted":true}'])('preserves corrupt non-tombstone object %s on PUT and DELETE', async (body) => {
    await (env as any).VAULTS.put(ID, body);
    expect(await readVaultWithEtag((env as any).VAULTS, ID)).toMatchObject({ cipher: null, tombstone: false });
    for (const method of ['PUT', 'DELETE'] as const) {
      for (const base of ['none', '100']) {
        expect((await SELF.fetch(mutation(method, base))).status).toBe(409);
        expect(await (await (env as any).VAULTS.get(ID)).text()).toBe(body);
      }
    }
  });

  it('refuses deletion if conditional put throws, never falling back to physical deletion', async () => {
    const bucket = {
      get: vi.fn(async () => ({ etag: 'original', json: async () => cipher(100) })),
      put: vi.fn(async () => { throw new Error('SYNTHETIC_PRIVATE_R2_ERROR'); }),
      delete: vi.fn(),
    };
    const res = await app.fetch(mutation('DELETE', '100'), { ...env, VAULTS: bucket } as any);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Vault deletion unavailable — nothing was deleted. Try again after refreshing.' });
    expect(bucket.put).toHaveBeenCalledTimes(1);
    expect(bucket.delete).not.toHaveBeenCalled();
  });
});
