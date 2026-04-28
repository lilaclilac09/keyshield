import { describe, it, expect, vi } from 'vitest';
import {
  InMemorySyncBackend,
  HttpSyncBackend,
  fetchLatestCipher,
} from './sync';
import type { VaultCipher } from './vault';

function makeCipher(updatedAt: number): VaultCipher {
  return {
    version: 1,
    iv: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'BBBB',
    updatedAt,
  };
}

describe('InMemorySyncBackend', () => {
  it('returns null until something has been pushed', async () => {
    const b = new InMemorySyncBackend();
    expect(await b.pull('vid')).toBeNull();
  });

  it('round-trips a push then pull', async () => {
    const b = new InMemorySyncBackend();
    const c = makeCipher(100);
    expect(await b.push('vid', c)).toBe(true);
    expect(await b.pull('vid')).toEqual(c);
  });

  it('rejects a push with a stale updatedAt (CAS)', async () => {
    const b = new InMemorySyncBackend();
    await b.push('vid', makeCipher(100));
    expect(await b.push('vid', makeCipher(99))).toBe(false);
    expect(await b.push('vid', makeCipher(100))).toBe(false); // equal also stale
    expect(await b.push('vid', makeCipher(101))).toBe(true);
  });

  it('isolates different vault IDs', async () => {
    const b = new InMemorySyncBackend();
    await b.push('alice', makeCipher(1));
    await b.push('bob', makeCipher(2));
    expect((await b.pull('alice'))!.updatedAt).toBe(1);
    expect((await b.pull('bob'))!.updatedAt).toBe(2);
  });

  it('remove makes pull return null', async () => {
    const b = new InMemorySyncBackend();
    await b.push('vid', makeCipher(1));
    await b.remove('vid');
    expect(await b.pull('vid')).toBeNull();
  });
});

describe('HttpSyncBackend', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('GET vault/:id parses the JSON response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(makeCipher(7)));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example/',
      fetchImpl: fetchImpl as any,
    });
    const c = await b.pull('vid');
    expect(c?.updatedAt).toBe(7);
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('https://x.example/vault/vid');
    expect(init.method).toBe('GET');
  });

  it('GET 404 returns null', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    expect(await b.pull('vid')).toBeNull();
  });

  it('PUT body is the cipher and Content-Type is JSON', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 200));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    const c = makeCipher(123);
    expect(await b.push('vid', c)).toBe(true);
    const [, init] = fetchImpl.mock.calls[0] as any;
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual(c);
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('PUT 409 means stale write — returns false instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 409 }));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    expect(await b.push('vid', makeCipher(1))).toBe(false);
  });

  it('throws on other non-OK statuses', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    await expect(b.pull('vid')).rejects.toThrow(/500/);
  });

  it('forwards the auth token as Bearer when provided', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 200));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      authToken: 'sekrit',
      fetchImpl: fetchImpl as any,
    });
    await b.pull('vid');
    const [, init] = fetchImpl.mock.calls[0] as any;
    expect(init.headers.Authorization).toBe('Bearer sekrit');
  });

  it('does NOT send Authorization when no token configured', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 200));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    await b.pull('vid');
    const [, init] = fetchImpl.mock.calls[0] as any;
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('DELETE 404 is not an error', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    await expect(b.remove('vid')).resolves.toBeUndefined();
  });
});

describe('HttpSyncBackend — ETag conditional GET', () => {
  function etagResponse(body: unknown, etag: string): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ETag: etag,
        'Cache-Control': 'private, max-age=10',
      },
    });
  }

  it('does NOT send If-None-Match on the first pull', async () => {
    const fetchImpl = vi.fn(async () => etagResponse(makeCipher(1), '"e1"'));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    await b.pull('vid');
    const [, init] = fetchImpl.mock.calls[0] as any;
    expect(init.headers['If-None-Match']).toBeUndefined();
  });

  it('caches the ETag and sends it on the next pull', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(etagResponse(makeCipher(1), '"e1"'))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    await b.pull('vid');
    await b.pull('vid');
    const [, secondInit] = fetchImpl.mock.calls[1] as any;
    expect(secondInit.headers['If-None-Match']).toBe('"e1"');
  });

  it('returns null on 304 (caller falls back to local cache)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(etagResponse(makeCipher(1), '"e1"'))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    const first = await b.pull('vid');
    expect(first?.updatedAt).toBe(1);
    const second = await b.pull('vid');
    expect(second).toBeNull(); // 304 → null, fetchLatestCipher uses cache
  });

  it('updates the cached ETag when the server returns a fresh one', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(etagResponse(makeCipher(1), '"e1"'))
      .mockResolvedValueOnce(etagResponse(makeCipher(2), '"e2"'))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    await b.pull('vid');
    await b.pull('vid');
    await b.pull('vid');
    const [, third] = fetchImpl.mock.calls[2] as any;
    expect(third.headers['If-None-Match']).toBe('"e2"');
  });

  it('clears the cached ETag on a successful push', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(etagResponse(makeCipher(1), '"e1"'))
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // PUT
      .mockResolvedValueOnce(etagResponse(makeCipher(2), '"e2"'));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    await b.pull('vid');
    await b.push('vid', makeCipher(2));
    await b.pull('vid');
    // Third call should be unconditional (no If-None-Match) because
    // the push invalidated the cached ETag.
    const [, third] = fetchImpl.mock.calls[2] as any;
    expect(third.headers['If-None-Match']).toBeUndefined();
  });

  it('clears the cached ETag on remove', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(etagResponse(makeCipher(1), '"e1"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(etagResponse(makeCipher(2), '"e2"'));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    await b.pull('vid');
    await b.remove('vid');
    await b.pull('vid');
    const [, third] = fetchImpl.mock.calls[2] as any;
    expect(third.headers['If-None-Match']).toBeUndefined();
  });

  it('clears the cached ETag on 404 (vault was wiped server-side)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(etagResponse(makeCipher(1), '"e1"'))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(etagResponse(makeCipher(99), '"e99"'));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    await b.pull('vid');
    expect(await b.pull('vid')).toBeNull();
    await b.pull('vid');
    const [, third] = fetchImpl.mock.calls[2] as any;
    expect(third.headers['If-None-Match']).toBeUndefined();
  });

  it('isolates ETags per vault id', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(etagResponse(makeCipher(1), '"vidA"'))
      .mockResolvedValueOnce(etagResponse(makeCipher(2), '"vidB"'))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x.example',
      fetchImpl: fetchImpl as any,
    });
    await b.pull('A');
    await b.pull('B');
    await b.pull('A');
    const [, third] = fetchImpl.mock.calls[2] as any;
    // The third call is for vault A — should send vidA's etag, not vidB's.
    expect(third.headers['If-None-Match']).toBe('"vidA"');
  });
});

describe('fetchLatestCipher', () => {
  it('returns the sync cipher when present', async () => {
    const b = new InMemorySyncBackend();
    await b.push('vid', makeCipher(10));
    const r = await fetchLatestCipher('vid', b);
    expect(r.source).toBe('sync');
    expect(r.cipher?.updatedAt).toBe(10);
  });

  it('returns null + source=sync when backend has nothing yet', async () => {
    const b = new InMemorySyncBackend();
    const r = await fetchLatestCipher('vid', b);
    expect(r.source).toBe('sync');
    expect(r.cipher).toBeNull();
  });

  it('falls back to cache when the backend throws', async () => {
    const explodingBackend = {
      pull: async () => {
        throw new Error('offline');
      },
    } as any;
    const r = await fetchLatestCipher('vid', explodingBackend, async () =>
      makeCipher(5),
    );
    expect(r.source).toBe('cache');
    expect(r.cipher?.updatedAt).toBe(5);
  });

  it('returns source=none when both backend and fallback fail', async () => {
    const explodingBackend = {
      pull: async () => {
        throw new Error('offline');
      },
    } as any;
    const r = await fetchLatestCipher('vid', explodingBackend, async () => null);
    expect(r.source).toBe('none');
    expect(r.cipher).toBeNull();
  });
});
