import { describe, expect, it, vi } from 'vitest';
import { MobileSyncBoundary, PairedSyncUnsupported, SyncHttpError, UnknownRevision, type VaultCipher } from './boundary';

const cipher: VaultCipher = { version: 1, iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==', updatedAt: 100 };
const response = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

function client(fetchImpl = vi.fn<typeof fetch>(), now = 200) {
  return { fetchImpl, sync: new MobileSyncBoundary({ baseUrl: 'http://127.0.0.1:8787/', getToken: () => 'synthetic-test-bearer', fetchImpl, now: () => now }) };
}

describe('mobile ciphertext sync boundary (not a native-device test)', () => {
  it('distinguishes unknown from absent; unknown mutations issue zero requests', async () => {
    const { sync, fetchImpl } = client();
    expect(sync.revision('a')).toBeUndefined();
    await expect(sync.push('a', cipher)).rejects.toBeInstanceOf(UnknownRevision);
    await expect(sync.remove('a')).rejects.toBeInstanceOf(UnknownRevision);
    expect(fetchImpl).not.toHaveBeenCalled();
    fetchImpl.mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(200));
    expect(await sync.pull('a')).toBeNull();
    expect(sync.revision('a')).toBeNull();
    await sync.push('a', cipher);
    const options = fetchImpl.mock.calls[1][1]!;
    expect(options.headers).toMatchObject({ 'X-Vault-Base-Revision': 'none' });
    expect(Object.keys(JSON.parse(options.body as string)).sort()).toEqual(['ciphertext', 'iv', 'updatedAt', 'version']);
    expect(sync.revision('a')).toBe(200);
  });

  it('keeps independent confirmed bases and advances beyond a future server clock', async () => {
    const { sync, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(response(200, { ...cipher, updatedAt: 1000 }))
      .mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(200));
    await sync.pull('a');
    await sync.pull('b');
    const saved = await sync.push('a', cipher);
    expect(saved.updatedAt).toBe(1001);
    expect(fetchImpl.mock.calls[2][1]!.headers).toMatchObject({ 'X-Vault-Base-Revision': '1000' });
    expect(sync.revision('b')).toBeNull();
    saved.updatedAt = 1;
    expect(sync.cached('a')!.updatedAt).toBe(1001);
  });

  it.each([409, 428, 500])('preserves confirmed ciphertext/revision on %i with exactly one write and no retry', async (status) => {
    const { sync, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(response(200, cipher)).mockResolvedValueOnce(response(status, { error: 'untrusted server detail' }));
    await sync.pull('a');
    await expect(sync.push('a', { ...cipher, ciphertext: 'AQEBAQEBAQEBAQEBAQEBAQ==' })).rejects.toMatchObject({ name: 'SyncHttpError', status });
    expect(sync.cached('a')).toEqual(cipher);
    expect(sync.revision('a')).toBe(100);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('preserves state on network failure, without a fallback or retry', async () => {
    const { sync, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(response(200, cipher)).mockRejectedValueOnce(new TypeError('offline'));
    await sync.pull('a');
    await expect(sync.push('a', cipher)).rejects.toThrow('offline');
    expect(sync.cached('a')).toEqual(cipher);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('304 and failed pulls never establish absence or replace a confirmed base', async () => {
    const { sync, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(response(304)).mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(response(200, cipher)).mockResolvedValueOnce(response(304));
    await expect(sync.pull('a')).rejects.toBeInstanceOf(UnknownRevision);
    await expect(sync.pull('a')).rejects.toThrow('offline');
    expect(sync.revision('a')).toBeUndefined();
    await sync.pull('a');
    await expect(sync.pull('a')).rejects.toBeInstanceOf(UnknownRevision);
    expect(sync.cached('a')).toEqual(cipher);
  });

  it('rejects malformed envelopes without exposing them to transport or cache', async () => {
    const { sync, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(response(200, { ...cipher, updatedAt: 'bad' })).mockResolvedValueOnce(response(404));
    await expect(sync.pull('a')).rejects.toThrow('Invalid vault ciphertext');
    expect(sync.revision('a')).toBeUndefined();
    await sync.pull('a');
    await expect(sync.push('a', { ...cipher, extra: 'not allowed' } as VaultCipher)).rejects.toThrow('Invalid vault ciphertext');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('entry removal is a ciphertext PUT; whole-vault deletion is a revision-checked DELETE', async () => {
    const { sync, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(response(200, cipher)).mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(204));
    await sync.pull('a');
    await sync.push('a', { ...cipher, ciphertext: 'AgICAgICAgICAgICAgICAg==' });
    expect(fetchImpl.mock.calls[1][1]!.method).toBe('PUT');
    await sync.remove('a');
    expect(fetchImpl.mock.calls[2][1]).toMatchObject({ method: 'DELETE', headers: { 'X-Vault-Base-Revision': '200' } });
    expect(sync.cached('a')).toBeNull();
  });

  it.each([409, 428, 503])('whole-vault DELETE %i retains confirmed state, once', async (status) => {
    const { sync, fetchImpl } = client();
    fetchImpl.mockResolvedValueOnce(response(200, cipher)).mockResolvedValueOnce(response(status));
    await sync.pull('a');
    await expect(sync.remove('a')).rejects.toBeInstanceOf(SyncHttpError);
    expect(sync.cached('a')).toEqual(cipher);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('disables paired writes and deletes before either slot can partially succeed', async () => {
    const { sync, fetchImpl } = client();
    await expect(sync.pushPair('daily', 'recovery', cipher)).rejects.toBeInstanceOf(PairedSyncUnsupported);
    await expect(sync.removePair('daily', 'recovery')).rejects.toBeInstanceOf(PairedSyncUnsupported);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sync.revision('daily')).toBeUndefined();
    expect(sync.revision('recovery')).toBeUndefined();
  });
});
