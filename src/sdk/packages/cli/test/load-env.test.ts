import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadEnv, resolveEnvPath } from '../src/lib/load-env.js';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keyshield-cli-load-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.KEYSHIELD_ENV_FILE;
});

describe('resolveEnvPath', () => {
  it('--env-file takes priority', async () => {
    const p = await resolveEnvPath({ envFile: 'foo.env', cwd: tmp });
    expect(p).toBe(path.join(tmp, 'foo.env'));
  });

  it('falls back to KEYSHIELD_ENV_FILE', async () => {
    process.env.KEYSHIELD_ENV_FILE = 'bar.env';
    const p = await resolveEnvPath({ cwd: tmp });
    expect(p).toBe(path.join(tmp, 'bar.env'));
  });

  it('finally falls back to ./.env', async () => {
    const p = await resolveEnvPath({ cwd: tmp });
    expect(p).toBe(path.join(tmp, '.env'));
  });
});

describe('loadEnv', () => {
  it('throws a helpful error when no .env exists', async () => {
    await expect(loadEnv({ cwd: tmp })).rejects.toThrow(
      /No env file found.*KeyShield popup/s,
    );
  });

  it('reads + parses an existing file', async () => {
    await fs.writeFile(path.join(tmp, '.env'), 'OPENAI=sk-test\n');
    const r = await loadEnv({ cwd: tmp });
    expect(r.parsed.values.get('OPENAI')).toBe('sk-test');
    expect(r.path).toBe(path.join(tmp, '.env'));
  });
});
