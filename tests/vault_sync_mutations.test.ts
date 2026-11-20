import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeHttpSyncBackend as webBackend } from '../src/web/lib/sync';

const cipher = { version: 1, iv: 'opaque-iv', ciphertext: 'opaque-ciphertext', updatedAt: 101 };
afterEach(() => { vi.unstubAllGlobals(); });

describe.each([['web', webBackend]] as const)('%s vault mutation transport', (_name, factory) => {
  it.each([null, 100])('sends the true base %s on PUT and DELETE', async (base) => {
    const network = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', network);
    const backend = factory('https://sync.synthetic.invalid');
    await expect(backend.push('vault', cipher, () => 'synthetic-token', base)).resolves.toBe('ok');
    await backend.remove('vault', () => 'synthetic-token', base);
    expect(network).toHaveBeenCalledTimes(2);
    for (const [, options] of network.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(new Headers(options.headers).get('X-Vault-Base-Revision')).toBe(base === null ? 'none' : String(base));
    }
  });

  it.each([409, 428])('surfaces status %i once without retry or reflecting unsafe server text', async (status) => {
    const network = vi.fn(async () => new Response('SYNTHETIC_PRIVATE_SERVER_DETAIL', { status, statusText: 'SYNTHETIC_PRIVATE_SERVER_DETAIL' }));
    vi.stubGlobal('fetch', network);
    const backend = factory('https://sync.synthetic.invalid');
    if (status === 409) await expect(backend.push('vault', cipher, () => 'token', 100)).resolves.toBe('conflict');
    else await expect(backend.push('vault', cipher, () => 'token', 100)).rejects.toThrow('Update KeyShield to keep syncing');
    expect(network).toHaveBeenCalledTimes(1);
    await expect(backend.remove('vault', () => 'token', 100)).rejects.toThrow(status === 409 ? 'vault changed — nothing was deleted, reload' : 'Update KeyShield to keep syncing');
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('fails closed on whole-vault deletion unavailability without reflecting server details or retrying', async () => {
    const network = vi.fn(async () => new Response('SYNTHETIC_PRIVATE_SERVER_DETAIL', { status: 503, statusText: 'SYNTHETIC_PRIVATE_SERVER_DETAIL' }));
    vi.stubGlobal('fetch', network);
    await expect(factory('https://sync.synthetic.invalid').remove('vault', () => 'token', 100)).rejects.toThrow('Whole-vault deletion failed. Refresh and try again.');
    expect(network).toHaveBeenCalledTimes(1);
  });
});
