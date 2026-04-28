import { describe, it, expect, vi } from 'vitest';
import { V2Client, KeyNotFoundError } from '../src/lib/v2-client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('V2Client.login', () => {
  it('POSTs userId+password to /auth/login and returns the token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ token: 'tok-abc' }));
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    expect(await c.login('alice', 'pw')).toBe('tok-abc');
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('http://srv/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ userId: 'alice', password: 'pw' });
  });

  it('throws on a non-OK status', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 401 }));
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    await expect(c.login('a', 'b')).rejects.toThrow(/401/);
  });

  it('throws if the response is missing token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    await expect(c.login('a', 'b')).rejects.toThrow(/missing.*token/);
  });

  it('strips a trailing slash from baseUrl', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ token: 't' }));
    const c = new V2Client({ baseUrl: 'http://srv/', fetchImpl: fetchImpl as any });
    await c.login('a', 'b');
    const [url] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('http://srv/auth/login');
  });
});

describe('V2Client.listKeys', () => {
  it('returns the items array from /manage/list', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        keys: ['openai', 'anthropic'],
        items: [
          { upstream: 'openai', createdAt: 1, updatedAt: 2 },
          { upstream: 'anthropic', createdAt: 3, updatedAt: 4 },
        ],
      }),
    );
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    const items = await c.listKeys('tok');
    expect(items.map((i) => i.upstream)).toEqual(['openai', 'anthropic']);
    const [, init] = fetchImpl.mock.calls[0] as any;
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('returns [] when the server has no keys yet', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ keys: [], items: [] }));
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    expect(await c.listKeys('tok')).toEqual([]);
  });
});

describe('V2Client.getKey', () => {
  it('hits /manage/decrypt/<upstream> and returns the plaintext key', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ upstream: 'openai', key: 'sk-secret' }),
    );
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    expect(await c.getKey('tok', 'openai')).toBe('sk-secret');
    const [url] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('http://srv/manage/decrypt/openai');
  });

  it('URL-encodes the upstream slug', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ upstream: 'a/b', key: 'x' }),
    );
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    await c.getKey('tok', 'a/b');
    const [url] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('http://srv/manage/decrypt/a%2Fb');
  });

  it('throws KeyNotFoundError on 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    await expect(c.getKey('tok', 'nope')).rejects.toBeInstanceOf(
      KeyNotFoundError,
    );
  });
});

describe('V2Client.storeKey / deleteKey', () => {
  it('storeKey POSTs upstream + apiKey', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    await c.storeKey('tok', 'openai', 'sk-x');
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('http://srv/manage/store');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ upstream: 'openai', apiKey: 'sk-x' });
  });

  it('deleteKey hits /manage/secret/<u> with DELETE', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    await c.deleteKey('tok', 'openai');
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('http://srv/manage/secret/openai');
    expect(init.method).toBe('DELETE');
  });

  it('deleteKey tolerates a 404 (already gone)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    await expect(c.deleteKey('tok', 'gone')).resolves.toBeUndefined();
  });

  it('logout swallows 401 (already-invalid token)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    await expect(c.logout('tok')).resolves.toBeUndefined();
  });

  it('logout throws on 5xx so the CLI can surface it', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 502 }));
    const c = new V2Client({ baseUrl: 'http://srv', fetchImpl: fetchImpl as any });
    await expect(c.logout('tok')).rejects.toThrow(/502/);
  });
});
