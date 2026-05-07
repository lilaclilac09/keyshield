/**
 * "Source" abstraction so commands don't have to branch on
 * "logged-in vs local file" everywhere.
 *
 * Two implementations:
 *   - V2Source     — talks to the v2-mvp HTTP API (proxy / vault)
 *   - LocalSource  — reads the popup-exported .env file
 *
 * Pick the right one with `resolveSource(opts)` — it checks for a
 * saved session first, falls back to .env.
 */

import { V2Client, KeyNotFoundError } from './v2-client.js';
import { loadSession } from './session-store.js';
import { loadEnv, resolveEnvPath, type LoadOptions } from './load-env.js';
import { lookupKey } from './env-file.js';

export interface KeySource {
  /** Human-readable description for `--verbose` / status messages. */
  describe(): string;
  /** Names only — no values. */
  list(): Promise<string[]>;
  /** Throws KeyNotFoundError if missing. */
  get(name: string): Promise<string>;
  /** Get all (used by `keyshield run` to build the env). */
  getAll(): Promise<Map<string, string>>;
}

export interface SourceOptions extends LoadOptions {
  /** Force a particular mode regardless of saved session. */
  mode?: 'v2' | 'local';
}

export async function resolveSource(
  opts: SourceOptions = {},
): Promise<KeySource> {
  if (opts.mode === 'local') return makeLocalSource(opts);
  if (opts.mode === 'v2') {
    const session = await loadSession();
    if (!session) {
      throw new Error('--mode=v2 but no active session. Run `keyshield login` first.');
    }
    return makeV2Source(session);
  }
  // Auto: prefer session if present.
  const session = await loadSession();
  if (session) return makeV2Source(session);
  return makeLocalSource(opts);
}

function makeLocalSource(opts: LoadOptions): KeySource {
  return {
    describe: () => 'local .env',
    async list() {
      const { parsed } = await loadEnv(opts);
      return [...parsed.values.keys()].sort();
    },
    async get(name: string) {
      const { parsed } = await loadEnv(opts);
      const v = lookupKey(parsed, name);
      if (v === undefined) throw new KeyNotFoundError(name);
      return v;
    },
    async getAll() {
      const { parsed } = await loadEnv(opts);
      return new Map(parsed.values);
    },
  };
}

function makeV2Source(session: {
  server: string;
  userId: string;
  token: string;
}): KeySource {
  const client = new V2Client({ baseUrl: session.server });
  return {
    describe: () => `${session.server} (as ${session.userId})`,
    async list() {
      const items = await client.listKeys(session.token);
      return items.map((i) => i.upstream).sort();
    },
    async get(name: string) {
      // v2-mvp's lookup is exact on the upstream slug; normalize the
      // user's input against the listed names so `keyshield get
      // OPENAI` finds an entry stored as `openai`.
      try {
        return await client.getKey(session.token, name);
      } catch (e) {
        if (!(e instanceof KeyNotFoundError)) throw e;
        const items = await client.listKeys(session.token);
        const lower = name.toLowerCase();
        const match = items.find(
          (i) =>
            i.upstream.toLowerCase() === lower ||
            i.upstream.toLowerCase().replace(/[-_]/g, '') ===
              lower.replace(/[-_]/g, ''),
        );
        if (!match) throw e;
        return await client.getKey(session.token, match.upstream);
      }
    },
    async getAll() {
      // List, then concurrently fetch each. Bounded by 8 in flight to
      // be polite to the server.
      const items = await client.listKeys(session.token);
      const results = new Map<string, string>();
      const queue = [...items];
      const workers = Array.from({ length: Math.min(8, queue.length) }, () =>
        (async () => {
          while (true) {
            const next = queue.shift();
            if (!next) return;
            const value = await client.getKey(session.token, next.upstream);
            results.set(next.upstream, value);
          }
        })(),
      );
      await Promise.all(workers);
      return results;
    },
  };
}

export { KeyNotFoundError };
