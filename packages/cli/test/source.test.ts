/**
 * Integration-level tests for the Source layer: prove that the right
 * branch (v2 vs local) is picked based on session state, and that
 * each branch flows through to the underlying transport correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveSource, KeyNotFoundError } from '../src/lib/source.js';
import { saveSession } from '../src/lib/session-store.js';

let tmp: string;
let sessFile: string;
let envFile: string;
let originalFetch: typeof fetch;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keyshield-source-'));
  sessFile = path.join(tmp, 'session.json');
  envFile = path.join(tmp, '.env');
  // Override XDG_CONFIG_HOME so the source layer's default
  // session-path picker writes inside our temp dir.
  process.env.XDG_CONFIG_HOME = tmp;
  originalFetch = globalThis.fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.XDG_CONFIG_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('resolveSource — local mode (no session)', () => {
  it('reads names from a local .env file', async () => {
    await fs.writeFile(envFile, 'OPENAI_PROD=sk-1\nSTRIPE=sk-2\n');
    const src = await resolveSource({ envFile });
    expect(src.describe()).toContain('local .env');
    expect(await src.list()).toEqual(['OPENAI_PROD', 'STRIPE']);
  });

  it('get returns the value, KeyNotFoundError if missing', async () => {
    await fs.writeFile(envFile, 'OPENAI_PROD=sk-1\n');
    const src = await resolveSource({ envFile });
    expect(await src.get('openai-prod')).toBe('sk-1');
    await expect(src.get('nope')).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  it('getAll returns all keys as a Map', async () => {
    await fs.writeFile(envFile, 'A=1\nB=2\n');
    const src = await resolveSource({ envFile });
    const all = await src.getAll();
    expect(all.get('A')).toBe('1');
    expect(all.get('B')).toBe('2');
    expect(all.size).toBe(2);
  });
});

describe('resolveSource — v2 mode (active session)', () => {
  beforeEach(async () => {
    // Seed a session at the XDG default path.
    const xdgPath = path.join(tmp, 'keyshield', 'session.json');
    await saveSession(
      {
        server: 'http://srv',
        userId: 'alice',
        token: 'tok',
        createdAt: 0,
      },
      xdgPath,
    );
  });

  it('describe() shows the server and user', async () => {
    globalThis.fetch = vi.fn() as any;
    const src = await resolveSource();
    expect(src.describe()).toBe('http://srv (as alice)');
  });

  it('list hits /manage/list and returns sorted upstream slugs', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          keys: ['stripe', 'openai'],
          items: [
            { upstream: 'stripe', createdAt: 1, updatedAt: 2 },
            { upstream: 'openai', createdAt: 3, updatedAt: 4 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as any;
    const src = await resolveSource();
    expect(await src.list()).toEqual(['openai', 'stripe']);
  });

  it('get hits /manage/decrypt/<upstream>', async () => {
    globalThis.fetch = vi.fn(async (url: any) => {
      expect(String(url)).toBe('http://srv/manage/decrypt/openai');
      return new Response(JSON.stringify({ upstream: 'openai', key: 'sk-x' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;
    const src = await resolveSource();
    expect(await src.get('openai')).toBe('sk-x');
  });

  it('get falls back to listing when the case differs', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async (url: any) => {
      callCount++;
      const u = String(url);
      if (u.endsWith('/manage/decrypt/OPENAI')) {
        return new Response('', { status: 404 });
      }
      if (u.endsWith('/manage/list')) {
        return new Response(
          JSON.stringify({
            keys: ['openai'],
            items: [{ upstream: 'openai', createdAt: 0, updatedAt: 0 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (u.endsWith('/manage/decrypt/openai')) {
        return new Response(
          JSON.stringify({ upstream: 'openai', key: 'sk-y' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`unexpected URL: ${u}`);
    }) as any;
    const src = await resolveSource();
    expect(await src.get('OPENAI')).toBe('sk-y');
    expect(callCount).toBe(3);
  });

  it('getAll fans out one decrypt per listed upstream', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      calls.push(u);
      if (u.endsWith('/manage/list')) {
        return new Response(
          JSON.stringify({
            keys: ['a', 'b', 'c'],
            items: [
              { upstream: 'a', createdAt: 1, updatedAt: 1 },
              { upstream: 'b', createdAt: 2, updatedAt: 2 },
              { upstream: 'c', createdAt: 3, updatedAt: 3 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const slug = u.split('/').pop()!;
      return new Response(
        JSON.stringify({ upstream: slug, key: `key-${slug}` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as any;
    const src = await resolveSource();
    const all = await src.getAll();
    expect(all.size).toBe(3);
    expect(all.get('a')).toBe('key-a');
    expect(all.get('b')).toBe('key-b');
    expect(all.get('c')).toBe('key-c');
    // 1 list + 3 decrypts = 4 calls.
    expect(calls.length).toBe(4);
  });
});

describe('resolveSource — v2 mode caching', () => {
  let cacheDir: string;
  beforeEach(async () => {
    cacheDir = path.join(tmp, 'cache');
    const xdgPath = path.join(tmp, 'keyshield', 'session.json');
    await saveSession(
      {
        server: 'http://srv',
        userId: 'alice',
        token: 'tok-cache',
        createdAt: 0,
      },
      xdgPath,
    );
  });

  function mockKeysFetch(): { calls: string[]; fn: typeof fetch } {
    const calls: string[] = [];
    const fn = vi.fn(async (url: any) => {
      const u = String(url);
      calls.push(u);
      if (u.endsWith('/manage/list')) {
        return new Response(
          JSON.stringify({
            keys: ['openai', 'stripe'],
            items: [
              { upstream: 'openai', createdAt: 1, updatedAt: 1 },
              { upstream: 'stripe', createdAt: 2, updatedAt: 2 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const slug = u.split('/').pop()!;
      return new Response(
        JSON.stringify({ upstream: slug, key: `key-${slug}` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as any;
    return { calls, fn };
  }

  it('getAll caches after the first fetch; second call hits zero network', async () => {
    const { calls, fn } = mockKeysFetch();
    globalThis.fetch = fn;

    const src1 = await resolveSource({ cacheDir });
    const all1 = await src1.getAll();
    expect(all1.size).toBe(2);
    const callsAfterFirst = calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Fresh resolveSource — proves the cache survives across V2Source
    // instances (i.e., across separate CLI invocations).
    const src2 = await resolveSource({ cacheDir });
    const all2 = await src2.getAll();
    expect(all2.get('openai')).toBe('key-openai');
    expect(all2.get('stripe')).toBe('key-stripe');
    expect(calls.length).toBe(callsAfterFirst); // no additional fetches
  });

  it('--no-cache bypasses the cache for both reads and writes', async () => {
    const { calls, fn } = mockKeysFetch();
    globalThis.fetch = fn;

    const src1 = await resolveSource({ cacheDir, noCache: true });
    await src1.getAll();
    const after1 = calls.length;

    const src2 = await resolveSource({ cacheDir, noCache: true });
    await src2.getAll();
    // Same number of network calls again — nothing was cached.
    expect(calls.length).toBe(after1 * 2);
  });

  it('expired cache triggers a re-fetch', async () => {
    const { calls, fn } = mockKeysFetch();
    globalThis.fetch = fn;

    const src1 = await resolveSource({ cacheDir, cacheTtlMs: 50 });
    await src1.getAll();
    const after1 = calls.length;

    await new Promise((r) => setTimeout(r, 80));
    const src2 = await resolveSource({ cacheDir, cacheTtlMs: 50 });
    await src2.getAll();
    expect(calls.length).toBeGreaterThan(after1);
  });

  it('get() serves from the cache without a network round-trip', async () => {
    const { calls, fn } = mockKeysFetch();
    globalThis.fetch = fn;

    // Populate cache via getAll first.
    const src1 = await resolveSource({ cacheDir });
    await src1.getAll();
    const after1 = calls.length;

    const src2 = await resolveSource({ cacheDir });
    expect(await src2.get('openai')).toBe('key-openai');
    expect(calls.length).toBe(after1);
  });

  it('get() falls back to the network when the requested key is not cached', async () => {
    const { calls, fn } = mockKeysFetch();
    globalThis.fetch = fn;

    const src1 = await resolveSource({ cacheDir });
    await src1.getAll();
    const after1 = calls.length;

    // 'twilio' wasn't in the original list — cache hit on the map
    // doesn't include it, so we should fall through to fetch.
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/manage/decrypt/twilio')) {
        return new Response(
          JSON.stringify({ upstream: 'twilio', key: 'sk-tw' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`unexpected URL: ${u}`);
    }) as any;
    const src2 = await resolveSource({ cacheDir });
    expect(await src2.get('twilio')).toBe('sk-tw');
    expect(calls.length).toBe(after1); // original mock untouched
  });
});

describe('resolveSource — explicit mode override', () => {
  it('--mode=local ignores any active session', async () => {
    const xdgPath = path.join(tmp, 'keyshield', 'session.json');
    await saveSession(
      { server: 'http://srv', userId: 'a', token: 't', createdAt: 0 },
      xdgPath,
    );
    await fs.writeFile(envFile, 'X=1\n');
    const src = await resolveSource({ mode: 'local', envFile });
    expect(src.describe()).toContain('local .env');
    expect(await src.list()).toEqual(['X']);
  });

  it('--mode=v2 errors out when no session', async () => {
    await expect(resolveSource({ mode: 'v2' })).rejects.toThrow(
      /no active session/i,
    );
  });
});
