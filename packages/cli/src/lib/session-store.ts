/**
 * Persists the v2-mvp login state to disk so subsequent `keyshield`
 * calls don't have to re-authenticate. Stored at:
 *
 *   ~/.config/keyshield/session.json   (Linux / macOS, follows XDG)
 *   $XDG_CONFIG_HOME/keyshield/session.json   (if set)
 *
 * File is written with mode 0600 (owner-read-only). The token is
 * an opaque bearer minted by the server; anyone with read access
 * to the file can use the API as the user, until the token expires
 * or `keyshield logout` runs.
 *
 * Schema is intentionally tiny — no PRF secrets, no derived keys,
 * just the bearer + the server it's bound to.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface Session {
  /** Server base URL the token is bound to. */
  server: string;
  /** Username supplied at login. Stored only as a UX convenience
   *  for `keyshield status`; the token alone is enough for auth. */
  userId: string;
  /** Opaque bearer token from /auth/login. */
  token: string;
  /** Unix-seconds when this session was created. */
  createdAt: number;
}

export function defaultSessionPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, 'keyshield', 'session.json');
  return path.join(os.homedir(), '.config', 'keyshield', 'session.json');
}

export async function loadSession(
  file = defaultSessionPath(),
): Promise<Session | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.token || !parsed.server || !parsed.userId) return null;
    return parsed;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveSession(
  session: Session,
  file = defaultSessionPath(),
): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  // Write atomically via a temp file in the same directory, then rename.
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(session, null, 2), {
    mode: 0o600,
    encoding: 'utf8',
  });
  await fs.rename(tmp, file);
  // chmod again — some platforms (Windows) ignore mode on writeFile.
  try {
    await fs.chmod(file, 0o600);
  } catch {
    /* best-effort */
  }
}

export async function clearSession(
  file = defaultSessionPath(),
): Promise<boolean> {
  try {
    await fs.unlink(file);
    return true;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return false;
    throw e;
  }
}
