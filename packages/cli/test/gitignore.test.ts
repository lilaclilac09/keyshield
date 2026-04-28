import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureGitignoresEnv, inspectGitignore } from '../src/lib/gitignore.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keyshield-cli-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('inspectGitignore', () => {
  it('reports exists=false on a fresh dir', async () => {
    const s = await inspectGitignore(tmp);
    expect(s.exists).toBe(false);
    expect(s.ignoresEnv).toBe(false);
  });

  it('detects an exact .env line', async () => {
    await fs.writeFile(path.join(tmp, '.gitignore'), 'node_modules\n.env\n');
    const s = await inspectGitignore(tmp);
    expect(s.exists).toBe(true);
    expect(s.ignoresEnv).toBe(true);
  });

  it('detects glob patterns like .env.*', async () => {
    await fs.writeFile(path.join(tmp, '.gitignore'), '.env.*\n');
    const s = await inspectGitignore(tmp);
    expect(s.ignoresEnvGlob).toBe(true);
    expect(s.ignoresEnv).toBe(false);
  });

  it('does not match a partial line like ".envrc"', async () => {
    await fs.writeFile(path.join(tmp, '.gitignore'), '.envrc\n');
    const s = await inspectGitignore(tmp);
    expect(s.ignoresEnv).toBe(false);
    expect(s.ignoresEnvGlob).toBe(false);
  });
});

describe('ensureGitignoresEnv', () => {
  it('creates .gitignore with .env if missing', async () => {
    const r = await ensureGitignoresEnv(tmp);
    expect(r.changed).toBe(true);
    expect(r.added).toEqual(['.env']);
    const text = await fs.readFile(path.join(tmp, '.gitignore'), 'utf8');
    expect(text).toContain('.env');
  });

  it('appends .env to an existing .gitignore', async () => {
    await fs.writeFile(path.join(tmp, '.gitignore'), 'node_modules\n');
    const r = await ensureGitignoresEnv(tmp);
    expect(r.changed).toBe(true);
    const text = await fs.readFile(path.join(tmp, '.gitignore'), 'utf8');
    expect(text).toContain('node_modules');
    expect(text).toMatch(/\.env\n$/);
  });

  it('is idempotent (no change on second run)', async () => {
    await ensureGitignoresEnv(tmp);
    const r2 = await ensureGitignoresEnv(tmp);
    expect(r2.changed).toBe(false);
    expect(r2.added).toEqual([]);
  });

  it('does NOT add .env.example (that file is meant to be committed)', async () => {
    await ensureGitignoresEnv(tmp);
    const text = await fs.readFile(path.join(tmp, '.gitignore'), 'utf8');
    expect(text).not.toContain('.env.example');
  });

  it('preserves existing line endings on append', async () => {
    await fs.writeFile(path.join(tmp, '.gitignore'), 'node_modules');
    await ensureGitignoresEnv(tmp);
    const text = await fs.readFile(path.join(tmp, '.gitignore'), 'utf8');
    // Should add a newline before .env so the original line isn't merged.
    expect(text).toBe('node_modules\n.env\n');
  });
});
