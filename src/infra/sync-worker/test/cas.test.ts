import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { issueJwtForTest } from '../src/auth';

const ID = 'revision-cas-vault';
const cipher = (updatedAt: number) => ({ version: 1, iv: 'opaque-iv', ciphertext: `opaque-cipher-${updatedAt}`, updatedAt });
let token: string;

function request(updatedAt: number, base?: string) {
  return new Request(`http://w/vault/${ID}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(base === undefined ? {} : { 'X-Vault-Base-Revision': base }),
    },
    body: JSON.stringify(cipher(updatedAt)),
  });
}

beforeEach(async () => {
  await (env as any).VAULTS.delete(ID);
  token = await issueJwtForTest(ID, (env as any).JWT_SECRET, (env as any).JWT_ISSUER);
});

describe('revision-aware vault PUT', () => {
  it('rejects a stale base even with a later incoming timestamp, leaving stored bytes untouched', async () => {
    await (env as any).VAULTS.put(ID, JSON.stringify(cipher(100)));
    expect((await SELF.fetch(request(200, '99'))).status).toBe(409);
    expect(await (await (env as any).VAULTS.get(ID)).json()).toEqual(cipher(100));
  });

  it('accepts a matching base without changing the stored format', async () => {
    await (env as any).VAULTS.put(ID, JSON.stringify(cipher(100)));
    expect((await SELF.fetch(request(101, '100'))).status).toBe(200);
    expect(await (await (env as any).VAULTS.get(ID)).json()).toEqual(cipher(101));
  });

  it('accepts none only for an absent vault', async () => {
    expect((await SELF.fetch(request(100, 'none'))).status).toBe(200);
    expect((await SELF.fetch(request(101, 'none'))).status).toBe(409);
    expect(await (await (env as any).VAULTS.get(ID)).json()).toEqual(cipher(100));
  });

  it('rejects a numeric base when the vault is absent', async () => {
    expect((await SELF.fetch(request(101, '100'))).status).toBe(409);
    expect(await (env as any).VAULTS.get(ID)).toBeNull();
  });

  it.each(['', 'invalid', '-1', '100.5', 'NaN'])('rejects malformed base %j', async (base) => {
    await (env as any).VAULTS.put(ID, JSON.stringify(cipher(100)));
    expect((await SELF.fetch(request(101, base))).status).toBe(428);
    expect(await (await (env as any).VAULTS.get(ID)).json()).toEqual(cipher(100));
  });

  it.each([99, 100])('rejects non-increasing revision %i even with a matching base', async (revision) => {
    await (env as any).VAULTS.put(ID, JSON.stringify(cipher(100)));
    expect((await SELF.fetch(request(revision, '100'))).status).toBe(409);
    expect(await (await (env as any).VAULTS.get(ID)).json()).toEqual(cipher(100));
  });

  it.each(['PUT', 'DELETE'])('refuses legacy %s before any R2 access, keeping old-client GET unchanged', async (method) => {
    await (env as any).VAULTS.put(ID, JSON.stringify(cipher(100)));
    const bucket = { get: vi.fn(), put: vi.fn(), delete: vi.fn() };
    const req = new Request(request(200), { method });
    const res = await app.fetch(req, { ...env, VAULTS: bucket } as any);
    expect(res.status).toBe(428);
    expect(await res.json()).toEqual({ error: 'Update KeyShield to keep syncing. Update the app and refresh.' });
    expect(bucket.get).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(bucket.delete).not.toHaveBeenCalled();
    const read = await SELF.fetch(`http://w/vault/${ID}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual(cipher(100));
  });

  it.each(['99', 'none'])('refuses a DELETE based on %s when stored revision is 100', async (base) => {
    await (env as any).VAULTS.put(ID, JSON.stringify(cipher(100)));
    const res = await SELF.fetch(new Request(request(200, base), { method: 'DELETE' }));
    expect(res.status).toBe(409);
    expect(await (await (env as any).VAULTS.get(ID)).json()).toEqual(cipher(100));
  });

  it('deletes only a matching revision; none succeeds only while absent', async () => {
    await (env as any).VAULTS.put(ID, JSON.stringify(cipher(100)));
    expect((await SELF.fetch(new Request(request(200, '100'), { method: 'DELETE' }))).status).toBe(204);
    expect(await (env as any).VAULTS.get(ID)).toBeNull();
    expect((await SELF.fetch(new Request(request(200, '100'), { method: 'DELETE' }))).status).toBe(409);
    expect((await SELF.fetch(new Request(request(200, 'none'), { method: 'DELETE' }))).status).toBe(204);
  });

  it('allows the revision header in browser CORS preflight', async () => {
    const res = await SELF.fetch(`http://w/vault/${ID}`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.ks.aileena.xyz', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'X-Vault-Base-Revision' },
    });
    expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('x-vault-base-revision');
  });

  it.each(['100', 'none'])('admits exactly one concurrent PUT built on %s using R2 conditions', async (base) => {
    let stored = base === 'none' ? null : { cipher: cipher(100), etag: 'original' };
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => { release = resolve; });
    const bucket = {
      get: vi.fn(async () => {
        const snapshot = stored;
        if (++reads === 2) release();
        await bothRead;
        return snapshot && { etag: snapshot.etag, json: async () => snapshot.cipher };
      }),
      put: vi.fn(async (_id: string, body: string, options: R2PutOptions) => {
        expect(options.onlyIf).toEqual(base === 'none' ? { etagDoesNotMatch: '*' } : { etagMatches: 'original' });
        if (base === 'none' ? stored !== null : stored?.etag !== 'original') return null;
        stored = { cipher: JSON.parse(body), etag: 'winner' };
        return { etag: 'winner' };
      }),
    };
    const responses = await Promise.all([101, 102].map((revision) => app.fetch(request(revision, base), { ...env, VAULTS: bucket } as any)));
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
    const winner = responses[0].status === 200 ? 101 : 102;
    expect(stored?.cipher).toEqual(cipher(winner));
    expect(bucket.get).toHaveBeenCalledTimes(2);
    expect(bucket.put).toHaveBeenCalledTimes(2);
  });
});
