/**
 * Disk persistence for agent keypairs. Same threat model as
 * session-store: 0600 file with the seed in plain JSON. Anyone who
 * can read this file can sign as the agent — so test the mode bit.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadAgent,
  saveAgent,
  deleteAgent,
  listAgents,
  type StoredAgent,
} from '../src/lib/agent-store.js';

let tmp: string;

const sample = (overrides: Partial<StoredAgent> = {}): StoredAgent => ({
  name: 'bot',
  pubkey_b58: 'PUBKEYBASE58',
  secret_b64: 'c2VjcmV0LXNlZWQ=',
  server: 'http://srv',
  ownerWallet: 'alice',
  agentId: 7,
  createdAt: 1700000000,
  ...overrides,
});

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keyshield-agents-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('saveAgent + loadAgent', () => {
  it('round-trips an entry', async () => {
    await saveAgent(sample({ name: 'bot' }), tmp);
    const got = await loadAgent('bot', tmp);
    expect(got).toEqual(sample({ name: 'bot' }));
  });

  it('returns null when the agent does not exist', async () => {
    expect(await loadAgent('nope', tmp)).toBeNull();
  });

  it('writes the file with mode 0600', async () => {
    if (process.platform === 'win32') return;
    await saveAgent(sample({ name: 'bot' }), tmp);
    const stat = await fs.stat(path.join(tmp, 'bot.json'));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('overwrites an existing entry on second save', async () => {
    await saveAgent(sample({ name: 'bot', agentId: 1 }), tmp);
    await saveAgent(sample({ name: 'bot', agentId: 99 }), tmp);
    const got = await loadAgent('bot', tmp);
    expect(got!.agentId).toBe(99);
  });

  it('rejects a name with bad characters', async () => {
    await expect(saveAgent(sample({ name: 'bad/name' }), tmp)).rejects.toThrow(
      /agent name must be/i,
    );
  });

  it('refuses to load via a name with bad characters too', async () => {
    await expect(loadAgent('../escape', tmp)).rejects.toThrow();
  });
});

describe('deleteAgent', () => {
  it('removes an existing entry and returns true', async () => {
    await saveAgent(sample({ name: 'bot' }), tmp);
    expect(await deleteAgent('bot', tmp)).toBe(true);
    expect(await loadAgent('bot', tmp)).toBeNull();
  });

  it('returns false when the entry never existed', async () => {
    expect(await deleteAgent('ghost', tmp)).toBe(false);
  });
});

describe('listAgents', () => {
  it('returns sorted names of stored agents only', async () => {
    await saveAgent(sample({ name: 'zeta' }), tmp);
    await saveAgent(sample({ name: 'alpha' }), tmp);
    await saveAgent(sample({ name: 'mid' }), tmp);
    // Drop a non-JSON file in the same dir; listAgents must ignore it.
    await fs.writeFile(path.join(tmp, 'README'), 'not an agent');
    expect(await listAgents(tmp)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('returns [] when the directory does not exist', async () => {
    expect(await listAgents(path.join(tmp, 'never-created'))).toEqual([]);
  });
});
