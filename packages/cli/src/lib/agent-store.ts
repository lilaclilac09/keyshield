/**
 * Disk persistence for agent keypairs.
 *
 *   ~/.config/keyshield/agents/<name>.json   (mode 0600, atomic write)
 *
 * One file per agent so the user can `rm` an individual key without
 * disturbing others. The file is the seed only — the public key is
 * derivable from it but we cache it alongside for quick lookups.
 *
 * The file also remembers which v2-mvp server + owner this agent was
 * registered against, so `keyshield agent login <name>` doesn't need
 * any other context.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface StoredAgent {
  /** Friendly label, also the filename stem. */
  name: string;
  /** Base58 of the 32-byte raw public key. */
  pubkey_b58: string;
  /** Base64 of the 32-byte raw secret seed. */
  secret_b64: string;
  /** v2-mvp server this agent was created against. */
  server: string;
  /** Owner wallet (= the user_id of the session that created the agent). */
  ownerWallet: string;
  /** Server-assigned numeric id from /agents/register. Useful for revoke. */
  agentId?: number;
  /** Unix-seconds the keypair was generated locally. */
  createdAt: number;
}

export function defaultAgentsDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, 'keyshield', 'agents');
  return path.join(os.homedir(), '.config', 'keyshield', 'agents');
}

function fileFor(name: string, dir = defaultAgentsDir()): string {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(name)) {
    throw new Error(
      `agent name must be 1–64 chars from [A-Za-z0-9._-] (got "${name}")`,
    );
  }
  return path.join(dir, `${name}.json`);
}

export async function loadAgent(
  name: string,
  dir = defaultAgentsDir(),
): Promise<StoredAgent | null> {
  try {
    const raw = await fs.readFile(fileFor(name, dir), 'utf8');
    const parsed = JSON.parse(raw) as StoredAgent;
    if (!parsed.pubkey_b58 || !parsed.secret_b64 || !parsed.server) return null;
    return parsed;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveAgent(
  agent: StoredAgent,
  dir = defaultAgentsDir(),
): Promise<void> {
  const file = fileFor(agent.name, dir);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(agent, null, 2), {
    mode: 0o600,
    encoding: 'utf8',
  });
  await fs.rename(tmp, file);
  try {
    await fs.chmod(file, 0o600);
  } catch {
    /* Windows ignores POSIX mode — best-effort. */
  }
}

export async function deleteAgent(
  name: string,
  dir = defaultAgentsDir(),
): Promise<boolean> {
  try {
    await fs.unlink(fileFor(name, dir));
    return true;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return false;
    throw e;
  }
}

export async function listAgents(
  dir = defaultAgentsDir(),
): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -'.json'.length))
      .sort();
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}
