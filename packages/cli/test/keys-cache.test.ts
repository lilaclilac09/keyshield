/**
 * Disk cache for fetched keys. Tests cover the round-trip, TTL
 * expiry, missing-file behaviour, and the cleanup paths used on
 * logout.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadKeysCache,
  saveKeysCache,
  clearKeysCache,
  DEFAULT_TTL_MS,
} from '../src/lib/keys-cache.js';

let tmp: string;
const TOKEN = 'tok-abc';
const OTHER_TOKEN = 'tok-xyz';

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keyshield-cache-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('loadKeysCache', () => {
  it('returns null when no entry exists', async () => {
    const got = await loadKeysCache(TOKEN, { dir: tmp });
    expect(got).toBeNull();
  });

  it('round-trips a Map', async () => {
    const keys = new Map([
      ['openai', 'sk-1'],
      ['stripe', 'sk-2'],
    ]);
    await saveKeysCache(TOKEN, keys, { dir: tmp });
    const got = await loadKeysCache(TOKEN, { dir: tmp });
    expect(got).not.toBeNull();
    expect(got!.get('openai')).toBe('sk-1');
    expect(got!.get('stripe')).toBe('sk-2');
    expect(got!.size).toBe(2);
  });

  it('returns null when the entry has expired', async () => {
    const keys = new Map([['k', 'v']]);
    await saveKeysCache(TOKEN, keys, { dir: tmp, ttlMs: 1_000, now: 1_000 });
    const got = await loadKeysCache(TOKEN, {
      dir: tmp,
      now: 1_000 + 1_001,
    });
    expect(got).toBeNull();
  });

  it('returns the entry when within TTL', async () => {
    const keys = new Map([['k', 'v']]);
    await saveKeysCache(TOKEN, keys, { dir: tmp, ttlMs: 1_000, now: 1_000 });
    const got = await loadKeysCache(TOKEN, { dir: tmp, now: 1_500 });
    expect(got).not.toBeNull();
    expect(got!.get('k')).toBe('v');
  });

  it('reader can request a tighter TTL than the writer set', async () => {
    const keys = new Map([['k', 'v']]);
    await saveKeysCache(TOKEN, keys, {
      dir: tmp,
      ttlMs: 60_000,
      now: 1_000,
    });
    // writer said 60s, reader says 100ms — within writer but past
    // reader, so it must return null.
    const got = await loadKeysCache(TOKEN, {
      dir: tmp,
      now: 1_000 + 200,
      ttlMs: 100,
    });
    expect(got).toBeNull();
  });

  it('returns null for corrupt JSON instead of throwing', async () => {
    const keys = new Map([['k', 'v']]);
    await saveKeysCache(TOKEN, keys, { dir: tmp });
    // Stomp the file with junk.
    const files = await fs.readdir(tmp);
    await fs.writeFile(path.join(tmp, files[0]), 'not json{', 'utf8');
    const got = await loadKeysCache(TOKEN, { dir: tmp });
    expect(got).toBeNull();
  });

  it('different tokens land in different files', async () => {
    await saveKeysCache(TOKEN, new Map([['a', '1']]), { dir: tmp });
    await saveKeysCache(OTHER_TOKEN, new Map([['b', '2']]), { dir: tmp });
    const a = await loadKeysCache(TOKEN, { dir: tmp });
    const b = await loadKeysCache(OTHER_TOKEN, { dir: tmp });
    expect(a!.get('a')).toBe('1');
    expect(a!.has('b')).toBe(false);
    expect(b!.get('b')).toBe('2');
    expect(b!.has('a')).toBe(false);
  });
});

describe('saveKeysCache', () => {
  it('creates the cache directory if missing', async () => {
    const nested = path.join(tmp, 'deep', 'cache');
    await saveKeysCache(TOKEN, new Map([['k', 'v']]), { dir: nested });
    const stat = await fs.stat(nested);
    expect(stat.isDirectory()).toBe(true);
  });

  it('writes the entry with mode 0600', async () => {
    if (process.platform === 'win32') return; // Windows ignores POSIX mode.
    await saveKeysCache(TOKEN, new Map([['k', 'v']]), { dir: tmp });
    const files = await fs.readdir(tmp);
    expect(files).toHaveLength(1);
    const stat = await fs.stat(path.join(tmp, files[0]));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('uses DEFAULT_TTL_MS when caller does not set it', async () => {
    await saveKeysCache(TOKEN, new Map([['k', 'v']]), { dir: tmp });
    const files = await fs.readdir(tmp);
    const raw = await fs.readFile(path.join(tmp, files[0]), 'utf8');
    expect(JSON.parse(raw).ttlMs).toBe(DEFAULT_TTL_MS);
  });

  it('overwrites a previous entry for the same token', async () => {
    await saveKeysCache(TOKEN, new Map([['k', 'old']]), { dir: tmp });
    await saveKeysCache(TOKEN, new Map([['k', 'new']]), { dir: tmp });
    const got = await loadKeysCache(TOKEN, { dir: tmp });
    expect(got!.get('k')).toBe('new');
    // Still just one file — the writer overwrote, not appended.
    const files = (await fs.readdir(tmp)).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(1);
  });
});

describe('clearKeysCache', () => {
  it('removes a specific token entry without touching others', async () => {
    await saveKeysCache(TOKEN, new Map([['a', '1']]), { dir: tmp });
    await saveKeysCache(OTHER_TOKEN, new Map([['b', '2']]), { dir: tmp });
    await clearKeysCache(TOKEN, tmp);
    expect(await loadKeysCache(TOKEN, { dir: tmp })).toBeNull();
    expect(await loadKeysCache(OTHER_TOKEN, { dir: tmp })).not.toBeNull();
  });

  it('is a no-op when the token has no cached entry', async () => {
    await expect(clearKeysCache(TOKEN, tmp)).resolves.toBeUndefined();
  });

  it('wipes the entire directory when called with no token', async () => {
    await saveKeysCache(TOKEN, new Map([['a', '1']]), { dir: tmp });
    await saveKeysCache(OTHER_TOKEN, new Map([['b', '2']]), { dir: tmp });
    await clearKeysCache(undefined, tmp);
    expect(await loadKeysCache(TOKEN, { dir: tmp })).toBeNull();
    expect(await loadKeysCache(OTHER_TOKEN, { dir: tmp })).toBeNull();
  });
});
