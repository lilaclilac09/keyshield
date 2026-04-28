/**
 * Lightweight .gitignore inspector + amender for `keyshield doctor`
 * and `keyshield run` to make sure the user hasn't put `.env` in a
 * project where it'd get accidentally committed.
 *
 * Not a full gitignore parser — we only check whether a line
 * matches an exact filename. That covers ~99% of real usage
 * (`.env` and `.env.*` are the standard idioms) and avoids pulling
 * in a 200-line library.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface GitignoreState {
  exists: boolean;
  /** True if `.env` (exactly) appears as a line in the gitignore. */
  ignoresEnv: boolean;
  /** True if any `*.env` / `.env.*` glob is present. */
  ignoresEnvGlob: boolean;
  /** Full file content if it exists. */
  raw: string;
}

export async function inspectGitignore(
  cwd: string = process.cwd(),
): Promise<GitignoreState> {
  const file = path.join(cwd, '.gitignore');
  let raw = '';
  let exists = false;
  try {
    raw = await fs.readFile(file, 'utf8');
    exists = true;
  } catch {
    return { exists: false, ignoresEnv: false, ignoresEnvGlob: false, raw: '' };
  }

  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const ignoresEnv = lines.some((l) => l === '.env');
  const ignoresEnvGlob = lines.some(
    (l) => l === '.env.*' || l === '*.env' || l === '.env*',
  );
  return { exists, ignoresEnv, ignoresEnvGlob, raw };
}

/**
 * Append `.env` and `.env.example` rules to `.gitignore`. Idempotent.
 * Never modifies anything else in the file.
 *
 * Returns `true` if the file was actually changed (so the caller can
 * tell the user "I added X, Y to your gitignore").
 */
export async function ensureGitignoresEnv(
  cwd: string = process.cwd(),
): Promise<{ changed: boolean; added: string[] }> {
  const file = path.join(cwd, '.gitignore');
  const state = await inspectGitignore(cwd);
  const added: string[] = [];

  let next = state.exists ? state.raw : '';
  if (!state.ignoresEnv) {
    if (next !== '' && !next.endsWith('\n')) next += '\n';
    next += '.env\n';
    added.push('.env');
  }
  // We deliberately do NOT add `.env.example` — the popup writes
  // that file to be COMMITTED, so it must not be gitignored.
  // (The file already says "safe to commit" in its header.)

  if (added.length === 0) return { changed: false, added };
  await fs.writeFile(file, next, 'utf8');
  return { changed: true, added };
}
