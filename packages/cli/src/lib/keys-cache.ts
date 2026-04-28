/**
 * Short-lived disk cache for keys fetched from a v2-mvp server.
 *
 * Why disk and not in-memory: each `keyshield run` invocation is a
 * fresh process, so an in-memory cache wouldn't survive between
 * invocations. The whole point is "second invocation is faster", so
 * we persist.
 *
 * Threat model: same as session-store. The cache file sits next to
 * `session.json` with mode 0600. Anyone who can read the cache can
 * also read the session token and fetch the same keys themselves —
 * so the cache adds no new attack surface, only a 30s window where
 * a revoked session can still see keys it had cached.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface CacheEntry {
  /** Map<upstream, key> serialized as a plain object. */
  keys: Record<string, string>;
  /** Unix-millis when this entry was written. */
  storedAt: number;
  /** TTL the writer chose, in ms. */
  ttlMs: number;
}

export const DEFAULT_TTL_MS = 30_000;

export function defaultCacheDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, 'keyshield', 'cache');
  return path.join(os.homedir(), '.config', 'keyshield', 'cache');
}

/** Derive a stable filename from a token without exposing the token. */
function tokenFingerprint(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

function cacheFilePath(token: string, dir = defaultCacheDir()): string {
  return path.join(dir, `${tokenFingerprint(token)}.json`);
}

/**
 * Returns the cached keys if the entry exists and hasn't expired,
 * otherwise null. Never throws on missing/corrupt files — callers
 * treat null as "miss, go fetch".
 */
export async function loadKeysCache(
  token: string,
  opts: { ttlMs?: number; dir?: string; now?: number } = {},
): Promise<Map<string, string> | null> {
  const dir = opts.dir ?? defaultCacheDir();
  const now = opts.now ?? Date.now();
  const file = cacheFilePath(token, dir);

  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    return null;
  }

  let parsed: CacheEntry;
  try {
    parsed = JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed.storedAt !== 'number' ||
    typeof parsed.ttlMs !== 'number' ||
    !parsed.keys ||
    typeof parsed.keys !== 'object'
  ) {
    return null;
  }

  // Honour both the writer's TTL and any tighter TTL the reader
  // wants (e.g. tests with --no-cache).
  const effectiveTtl = Math.min(
    parsed.ttlMs,
    opts.ttlMs ?? parsed.ttlMs,
  );
  if (now - parsed.storedAt > effectiveTtl) return null;

  return new Map(Object.entries(parsed.keys));
}

export async function saveKeysCache(
  token: string,
  keys: Map<string, string>,
  opts: { ttlMs?: number; dir?: string; now?: number } = {},
): Promise<void> {
  const dir = opts.dir ?? defaultCacheDir();
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now ?? Date.now();
  const file = cacheFilePath(token, dir);

  const entry: CacheEntry = {
    keys: Object.fromEntries(keys),
    storedAt: now,
    ttlMs,
  };

  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(entry), {
    mode: 0o600,
    encoding: 'utf8',
  });
  await fs.rename(tmp, file);
  try {
    await fs.chmod(file, 0o600);
  } catch {
    /* best-effort, Windows ignores mode */
  }
}

/**
 * Drop the cache for a specific token, or — if no token is given —
 * the entire cache directory. Used on logout/login so a stale
 * principal can't leak keys to the next one.
 */
export async function clearKeysCache(
  token?: string,
  dir = defaultCacheDir(),
): Promise<void> {
  if (token) {
    try {
      await fs.unlink(cacheFilePath(token, dir));
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }
    return;
  }
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}
