import { describe, it, expect, vi } from 'vitest';
import { HttpSyncBackend } from './sync';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CIPHER = { version: 1, iv: 'AAAA', ciphertext: 'BBBB', updatedAt: 1 };

describe('HttpSyncBackend — getToken / refreshToken', () => {
  it('forwards the dynamic token from getToken on each call', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(CIPHER));
    let counter = 0;
    const b = new HttpSyncBackend({
      baseUrl: 'https://x',
      getToken: () => `tok-${++counter}`,
      fetchImpl: fetchImpl as any,
    });

    await b.pull('vid');
    await b.pull('vid');

    const headers1 = (fetchImpl.mock.calls[0] as any)[1].headers;
    const headers2 = (fetchImpl.mock.calls[1] as any)[1].headers;
    expect(headers1.Authorization).toBe('Bearer tok-1');
    expect(headers2.Authorization).toBe('Bearer tok-2');
  });

  it('falls back to authToken when no getToken is provided', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(CIPHER));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x',
      authToken: 'static-tok',
      fetchImpl: fetchImpl as any,
    });
    await b.pull('vid');
    const headers = (fetchImpl.mock.calls[0] as any)[1].headers;
    expect(headers.Authorization).toBe('Bearer static-tok');
  });

  it('omits Authorization when getToken returns null', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'no auth' }, 401));
    const b = new HttpSyncBackend({
      baseUrl: 'https://x',
      getToken: () => null,
      fetchImpl: fetchImpl as any,
    });
    await b.pull('vid').catch(() => {});
    const headers = (fetchImpl.mock.calls[0] as any)[1].headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it('refreshes the token once on 401 and retries the request', async () => {
    let firstCall = true;
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      if (firstCall) {
        firstCall = false;
        // Simulate "current token is bad" — the worker rejects it.
        if (init.headers.Authorization === 'Bearer stale-tok') {
          return jsonResponse({ error: 'invalid token' }, 401);
        }
      }
      // After refresh, the new token works.
      if (init.headers.Authorization === 'Bearer fresh-tok') {
        return jsonResponse(CIPHER);
      }
      return jsonResponse({}, 500);
    });

    const refreshToken = vi.fn(async () => 'fresh-tok');
    const b = new HttpSyncBackend({
      baseUrl: 'https://x',
      getToken: () => 'stale-tok',
      refreshToken,
      fetchImpl: fetchImpl as any,
    });

    const r = await b.pull('vid');
    expect(r).toEqual(CIPHER);
    expect(refreshToken).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry more than once, even if refresh also yields a bad token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: '' }, 401));
    const refreshToken = vi.fn(async () => 'still-bad');
    const b = new HttpSyncBackend({
      baseUrl: 'https://x',
      getToken: () => 'first-bad',
      refreshToken,
      fetchImpl: fetchImpl as any,
    });
    // pull() will eventually throw because the second response is also 401;
    // we just want to assert the call shape.
    await b.pull('vid').catch(() => {});
    expect(fetchImpl).toHaveBeenCalledTimes(2); // original + 1 retry only
    expect(refreshToken).toHaveBeenCalledOnce();
  });

  it('passes through non-401 errors without invoking the refresher', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 500));
    const refreshToken = vi.fn(async () => 'never-called');
    const b = new HttpSyncBackend({
      baseUrl: 'https://x',
      getToken: () => 'tok',
      refreshToken,
      fetchImpl: fetchImpl as any,
    });
    await expect(b.pull('vid')).rejects.toThrow(/500/);
    expect(refreshToken).not.toHaveBeenCalled();
  });
});
