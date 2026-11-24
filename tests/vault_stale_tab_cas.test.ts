import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultCipher, VaultPlaintext } from '../src/web/lib/vault';

const prf = new Uint8Array(32).fill(7).buffer;
const original = { upstream: 'original', apiKey: 'sk-test-SYNTHETIC-original', addedAt: 1 };
let stored: VaultCipher | null;
let puts: Array<{ base: string | null; cipher: VaultCipher }>;
let failNetwork: boolean;
let requireUpdate: boolean;

beforeEach(() => {
  vi.resetModules();
  stored = null;
  puts = [];
  failNetwork = false;
  requireUpdate = false;
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith('/auth/exchange')) return Response.json({ token: 'synthetic-token', expiresAt: Date.now() + 600000 });
    if (input.includes('/vault/') && init?.method === 'GET') return stored ? Response.json(stored) : new Response(null, { status: 404 });
    if (input.includes('/vault/') && init?.method === 'PUT') {
      const base = new Headers(init.headers).get('X-Vault-Base-Revision');
      const cipher = JSON.parse(String(init.body)) as VaultCipher;
      puts.push({ base, cipher });
      if (requireUpdate) return new Response(null, { status: 428 });
      if (failNetwork) throw new Error('synthetic network failure');
      if (base !== (stored ? String(stored.updatedAt) : 'none') || (stored && cipher.updatedAt <= stored.updatedAt)) return new Response(null, { status: 409 });
      stored = cipher;
      return Response.json({ ok: true });
    }
    throw new Error('unexpected request');
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function seed(revision = 100) {
  const crypto = await import('../src/web/lib/vault');
  stored = await crypto.encryptVault(await crypto.deriveMasterKey(prf), { entries: { original }, updatedAt: revision });
}

async function tab(flavor: 'web' | 'shared' = 'web') {
  vi.resetModules();
  const session = flavor === 'web' ? await import('../src/web/lib/vault-session') : await import('../packages/shared/src/lib/vault-session');
  await session.unlockVault(prf, {});
  return session;
}

async function serverPlaintext(): Promise<VaultPlaintext> {
  const crypto = await import('../src/web/lib/vault');
  return crypto.decryptVault(await crypto.deriveMasterKey(prf), stored!);
}

describe('confirmed vault revisions across tabs', () => {
  it.each([
    ['web', 'save'], ['web', 'delete'], ['shared', 'save'], ['shared', 'delete'],
  ] as const)('%s rejects a stale %s once, without advancing local plaintext or base', async (flavor, operation) => {
    await seed();
    const first = await tab(flavor);
    const stale = await tab(flavor);
    const lastConfirmed = stale.listEntries();
    await first.addEntry('first', 'sk-test-SYNTHETIC-first');
    expect(puts[0].base).toBe('100');
    const serverAfterFirst = stored;
    const before = puts.length;
    const mutation = operation === 'save' ? stale.addEntry('second', 'sk-test-SYNTHETIC-second') : stale.removeEntry('original');
    await expect(mutation).rejects.toThrow(/[Vv]ault changed in another tab\/device. Reload and unlock to refresh./);
    expect(puts).toHaveLength(before + 1);
    expect(puts.at(-1)?.base).toBe('100');
    expect(stored).toBe(serverAfterFirst);
    expect(stale.listEntries()).toEqual(lastConfirmed);
    expect(Object.keys((await serverPlaintext()).entries)).toEqual(['original', 'first']);
    expect(JSON.stringify(puts)).not.toContain('sk-test-SYNTHETIC');
    expect(Object.keys(puts.at(-1)!.cipher).sort()).toEqual(['ciphertext', 'iv', 'updatedAt', 'version']);

    // An explicit second attempt still uses the last confirmed base.
    await expect(stale.removeEntry('original')).rejects.toThrow(/[Vv]ault changed/);
    expect(puts).toHaveLength(before + 2);
    expect(puts.at(-1)?.base).toBe('100');
    expect(stale.listEntries()).toEqual(lastConfirmed);
    await stale.unlockVault(prf, {});
    await stale.addEntry('refreshed', 'sk-test-SYNTHETIC-refreshed');
    expect(puts.at(-1)?.base).toBe(String(serverAfterFirst!.updatedAt));
    expect(Object.keys((await serverPlaintext()).entries)).toEqual(['original', 'first', 'refreshed']);
  });

  it.each(['web', 'shared'] as const)('%s creates from none, tracks successful saves and removals, and advances past a future server clock', async (flavor) => {
    const revision = Date.now() + 1000000;
    vi.spyOn(Date, 'now').mockReturnValue(revision);
    const session = await tab(flavor);
    await session.addEntry('first', 'sk-test-SYNTHETIC-first');
    expect(puts[0].base).toBe('none');
    expect(puts[0].cipher.updatedAt).toBe(revision);
    vi.mocked(Date.now).mockReturnValue(revision - 500000);
    await session.addEntry('second', 'sk-test-SYNTHETIC-second');
    expect(puts[1].base).toBe(String(revision));
    expect(puts[1].cipher.updatedAt).toBe(revision + 1);
    await session.removeEntry('first');
    expect(puts[2].base).toBe(String(revision + 1));
    expect(puts[2].cipher.updatedAt).toBe(revision + 2);
    expect(Object.keys((await serverPlaintext()).entries)).toEqual(['second']);
    await session.removeEntry('missing');
    expect(puts).toHaveLength(flavor === 'web' ? 3 : 4);
  });

  it.each([
    ['web', 'save'], ['web', 'delete'], ['shared', 'save'], ['shared', 'delete'],
  ] as const)('%s surfaces update-needed for a %s without retry or advancing state', async (flavor, operation) => {
    await seed();
    const session = await tab(flavor);
    requireUpdate = true;
    const mutation = operation === 'save' ? session.addEntry('failed', 'sk-test-SYNTHETIC-failed') : session.removeEntry('original');
    await expect(mutation).rejects.toThrow('Update KeyShield to keep syncing');
    expect(session.listEntries()).toEqual([original]);
    expect(puts).toHaveLength(1);
    expect(puts[0].base).toBe('100');
    expect(stored?.updatedAt).toBe(100);
    requireUpdate = false;
    await session.addEntry('updated', 'sk-test-SYNTHETIC-updated');
    expect(puts[1].base).toBe('100');
    expect(Object.keys((await serverPlaintext()).entries)).toEqual(['original', 'updated']);
  });

  it('uses the pulled cipher revision rather than the local clock', async () => {
    const revision = Date.now() + 1000000;
    await seed(revision);
    const session = await tab();
    await session.addEntry('first', 'sk-test-SYNTHETIC-first');
    expect(puts[0].base).toBe(String(revision));
    expect(puts[0].cipher.updatedAt).toBe(revision + 1);
  });

  it('preserves the confirmed base and plaintext on transport failure', async () => {
    await seed();
    const session = await tab();
    failNetwork = true;
    await expect(session.addEntry('failed', 'sk-test-SYNTHETIC-failed')).rejects.toThrow('Key NOT saved');
    expect(session.listEntries()).toEqual([original]);
    expect(puts).toHaveLength(1);
    expect(stored?.updatedAt).toBe(100);
    failNetwork = false;
    await session.addEntry('retry', 'sk-test-SYNTHETIC-retry');
    expect(puts[1].base).toBe('100');
    expect(Object.keys((await serverPlaintext()).entries)).toEqual(['original', 'retry']);
  });
});
