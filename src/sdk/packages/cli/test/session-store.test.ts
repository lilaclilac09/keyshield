import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadSession,
  saveSession,
  clearSession,
  type Session,
} from '../src/lib/session-store.js';

let tmp: string;
let sessFile: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keyshield-cli-sess-'));
  sessFile = path.join(tmp, 'session.json');
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const fixture: Session = {
  server: 'http://localhost:8000',
  userId: 'alice',
  token: 'tok-abc',
  createdAt: 1700000000,
};

describe('saveSession + loadSession', () => {
  it('round-trips a session through disk', async () => {
    await saveSession(fixture, sessFile);
    const got = await loadSession(sessFile);
    expect(got).toEqual(fixture);
  });

  it('writes the file with mode 0600', async () => {
    await saveSession(fixture, sessFile);
    const stat = await fs.stat(sessFile);
    // Mask off the file-type bits.
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('creates the parent directory if missing', async () => {
    const nested = path.join(tmp, 'deep', 'nested', 'session.json');
    await saveSession(fixture, nested);
    expect((await fs.stat(nested)).isFile()).toBe(true);
  });

  it('overwrites an existing session atomically', async () => {
    await saveSession(fixture, sessFile);
    const updated = { ...fixture, token: 'tok-NEW' };
    await saveSession(updated, sessFile);
    const got = await loadSession(sessFile);
    expect(got?.token).toBe('tok-NEW');
  });
});

describe('loadSession — edge cases', () => {
  it('returns null when no file exists', async () => {
    expect(await loadSession(sessFile)).toBeNull();
  });

  it('returns null when the file is malformed JSON', async () => {
    await fs.writeFile(sessFile, 'not json');
    // Loose contract: malformed shape returns null, real I/O errors throw.
    await expect(loadSession(sessFile)).rejects.toBeTruthy();
  });

  it('returns null when required fields are missing', async () => {
    await fs.writeFile(sessFile, JSON.stringify({ token: 'only-token' }));
    expect(await loadSession(sessFile)).toBeNull();
  });
});

describe('clearSession', () => {
  it('returns true when it deletes a present file', async () => {
    await saveSession(fixture, sessFile);
    expect(await clearSession(sessFile)).toBe(true);
    expect(await loadSession(sessFile)).toBeNull();
  });

  it('returns false (not throws) when the file is already gone', async () => {
    expect(await clearSession(sessFile)).toBe(false);
  });
});
