/**
 * Integration tests for `keyshield run`'s env-var precedence:
 *
 *   .env (low)  <  process.env (mid)  <  KeyShield source (high)
 *
 * Spawns a real subprocess and asks it to write its env into a
 * file; we then read the file back to confirm what the child saw.
 * The file dance is necessary because `runRun` uses
 * `stdio: 'inherit'`, which goes straight to the parent's underlying
 * fd and bypasses any `process.stdout.write` override.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runRun } from '../src/commands/run.js';
import { saveSession } from '../src/lib/session-store.js';

let tmp: string;
let envFile: string;
let originalFetch: typeof fetch;
let originalStderrWrite: typeof process.stderr.write;
const POLLUTING_VARS = ['TEST_FROM_DOTENV', 'TEST_OVERRIDE', 'TEST_KEYSHIELD', 'OPENAI'];

function mockV2Fetch(keys: Record<string, string>) {
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.endsWith('/manage/list')) {
      const items = Object.keys(keys).map((k) => ({
        upstream: k,
        createdAt: 0,
        updatedAt: 0,
      }));
      return new Response(
        JSON.stringify({ keys: Object.keys(keys), items }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const slug = u.split('/').pop()!;
    if (slug in keys) {
      return new Response(
        JSON.stringify({ upstream: slug, key: keys[slug] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('', { status: 404 });
  }) as any;
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keyshield-run-'));
  envFile = path.join(tmp, '.env');
  process.env.XDG_CONFIG_HOME = tmp;
  // Point the auto-merge at our test .env without depending on cwd.
  process.env.KEYSHIELD_ENV_FILE = envFile;
  originalFetch = globalThis.fetch;
  // Silence the "[keyshield] injecting ..." status line.
  originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((..._a: any[]) => true) as any;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.KEYSHIELD_ENV_FILE;
  process.stderr.write = originalStderrWrite;
  await fs.rm(tmp, { recursive: true, force: true });
  for (const k of POLLUTING_VARS) delete process.env[k];
});

async function spawnAndCaptureEnv(
  opts: any = {},
): Promise<Record<string, string>> {
  // Use process.execPath (absolute path to node) so the test works
  // even with --clean, which empties PATH in the child env.
  const dumpFile = path.join(tmp, 'env-dump.json');
  const code = `require('fs').writeFileSync(${JSON.stringify(dumpFile)}, JSON.stringify(process.env));`;
  await runRun([process.execPath, '-e', code], opts);
  const raw = await fs.readFile(dumpFile, 'utf8');
  return JSON.parse(raw);
}

describe('keyshield run — env merge precedence (v2 mode)', () => {
  beforeEach(async () => {
    const xdgPath = path.join(tmp, 'keyshield', 'session.json');
    await saveSession(
      {
        server: 'http://srv',
        userId: 'alice',
        token: 'tok-merge',
        createdAt: 0,
      },
      xdgPath,
    );
  });

  it('auto-merges ./.env defaults into the child env', async () => {
    await fs.writeFile(envFile, 'TEST_FROM_DOTENV=hello\n');
    mockV2Fetch({ openai: 'sk-from-keyshield' });

    const env = await spawnAndCaptureEnv({ mode: 'v2' });
    expect(env.TEST_FROM_DOTENV).toBe('hello');
    expect(env.OPENAI).toBe('sk-from-keyshield');
  });

  it('process.env wins over .env (existing shell vars survive)', async () => {
    await fs.writeFile(envFile, 'TEST_OVERRIDE=from-dotenv\n');
    process.env.TEST_OVERRIDE = 'from-shell';
    mockV2Fetch({});

    const env = await spawnAndCaptureEnv({ mode: 'v2' });
    expect(env.TEST_OVERRIDE).toBe('from-shell');
  });

  it('KeyShield source wins over both .env and process.env', async () => {
    await fs.writeFile(envFile, 'OPENAI=from-dotenv\n');
    process.env.OPENAI = 'from-shell';
    mockV2Fetch({ openai: 'sk-from-keyshield' });

    const env = await spawnAndCaptureEnv({ mode: 'v2' });
    expect(env.OPENAI).toBe('sk-from-keyshield');
  });

  it('--clean wipes process.env AND skips .env auto-merge', async () => {
    await fs.writeFile(envFile, 'TEST_FROM_DOTENV=should-not-leak\n');
    process.env.TEST_OVERRIDE = 'should-not-leak-either';
    mockV2Fetch({ openai: 'sk-from-keyshield' });

    const env = await spawnAndCaptureEnv({ mode: 'v2', clean: true });
    expect(env.TEST_FROM_DOTENV).toBeUndefined();
    expect(env.TEST_OVERRIDE).toBeUndefined();
    expect(env.OPENAI).toBe('sk-from-keyshield');
  });

  it('--no-merge-env skips .env but keeps process.env', async () => {
    await fs.writeFile(envFile, 'TEST_FROM_DOTENV=should-be-skipped\n');
    process.env.TEST_OVERRIDE = 'should-survive';
    mockV2Fetch({});

    const env = await spawnAndCaptureEnv({ mode: 'v2', mergeEnv: false });
    expect(env.TEST_FROM_DOTENV).toBeUndefined();
    expect(env.TEST_OVERRIDE).toBe('should-survive');
  });
});

describe('keyshield run — local mode', () => {
  it('does NOT auto-merge .env (source already consumed it)', async () => {
    // Local source returns the .env contents as `all`, so re-loading
    // them as "defaults" would be redundant. Locking in: no surprise
    // double-load.
    await fs.writeFile(envFile, 'OPENAI=sk-from-local\n');
    const env = await spawnAndCaptureEnv({ mode: 'local', envFile });
    expect(env.OPENAI).toBe('sk-from-local');
  });
});
