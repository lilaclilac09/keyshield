/**
 * Public /auth/* POSTs are rate limited per route + client IP, and the worker
 * refuses to run without a real JWT_SECRET.
 */
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import { AUTH_LIMIT, allowAuthRequest, resetMemoryWindows } from '../src/ratelimit';

function challenge(ip: string) {
  return SELF.fetch('http://w/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ vaultId: 'rl-vault-not-registered' }),
  });
}

describe('rate limit on /auth/* POSTs', () => {
  it('uses the AUTH_RATE_LIMITER binding from wrangler.toml', () => {
    expect(typeof (env as any).AUTH_RATE_LIMITER?.limit).toBe('function');
  });

  it(`answers 429 after ${AUTH_LIMIT} calls from one IP, other IPs unaffected`, async () => {
    const statuses: number[] = [];
    for (let i = 0; i < AUTH_LIMIT + 3; i++) statuses.push((await challenge('203.0.113.7')).status);
    expect(statuses.slice(0, AUTH_LIMIT).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(AUTH_LIMIT)).toEqual([429, 429, 429]);
    const limited = await challenge('203.0.113.7');
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect((await challenge('198.51.100.9')).status).toBe(404);
  });

  it('does not limit GET /health', async () => {
    for (let i = 0; i < AUTH_LIMIT + 2; i++) {
      expect((await SELF.fetch('http://w/health')).status).toBe(200);
    }
  });

  it('falls back to a per-isolate window when the binding is missing', async () => {
    resetMemoryWindows();
    const results: boolean[] = [];
    for (let i = 0; i < AUTH_LIMIT + 1; i++) results.push(await allowAuthRequest(undefined, '/auth/register', '192.0.2.1', 1000));
    expect(results.filter(Boolean).length).toBe(AUTH_LIMIT);
    expect(results.at(-1)).toBe(false);
    // New window after the period.
    expect(await allowAuthRequest(undefined, '/auth/register', '192.0.2.1', 1000 + 61_000)).toBe(true);
  });
});

describe('JWT_SECRET must be a real secret', () => {
  it('returns 503 when JWT_SECRET is missing', async () => {
    const r = await worker.fetch(
      new Request('http://w/auth/challenge', { method: 'POST', body: '{}' }),
      { ...(env as any), JWT_SECRET: undefined },
      { waitUntil() {}, passThroughOnException() {} } as any,
    );
    expect(r.status).toBe(503);
  });

  it('returns 503 when JWT_SECRET is too short', async () => {
    const r = await worker.fetch(
      new Request('http://w/vault/abc', { method: 'GET' }),
      { ...(env as any), JWT_SECRET: 'short' },
      { waitUntil() {}, passThroughOnException() {} } as any,
    );
    expect(r.status).toBe(503);
  });

  it('health stays up without a secret', async () => {
    const r = await worker.fetch(new Request('http://w/health'), { ...(env as any), JWT_SECRET: undefined }, {
      waitUntil() {},
      passThroughOnException() {},
    } as any);
    expect(r.status).toBe(200);
  });
});
