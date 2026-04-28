/**
 * Resolve which `.env` file to read from. Default search order:
 *   1. --env-file <path> on the CLI
 *   2. $KEYSHIELD_ENV_FILE
 *   3. ./.env
 *
 * Bails with a clear error if none of the above exist, so the CLI
 * never silently runs a command without injecting anything.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseEnvFile, type ParsedEnv } from './env-file.js';

export interface LoadOptions {
  /** Explicit path. Highest priority. */
  envFile?: string;
  /** Where to look for the default `.env`. Defaults to cwd. */
  cwd?: string;
}

export interface Loaded {
  path: string;
  parsed: ParsedEnv;
}

export async function resolveEnvPath(opts: LoadOptions = {}): Promise<string> {
  if (opts.envFile) return path.resolve(opts.cwd ?? process.cwd(), opts.envFile);
  const fromEnv = process.env.KEYSHIELD_ENV_FILE;
  if (fromEnv) return path.resolve(opts.cwd ?? process.cwd(), fromEnv);
  return path.resolve(opts.cwd ?? process.cwd(), '.env');
}

export async function loadEnv(opts: LoadOptions = {}): Promise<Loaded> {
  const p = await resolveEnvPath(opts);
  let content: string;
  try {
    content = await fs.readFile(p, 'utf8');
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      throw new Error(
        `No env file found at ${p}.\n` +
          `Export one from the KeyShield popup:\n` +
          `  open the popup → "Export .env" → save here.\n` +
          `Or pass --env-file <path>.`,
      );
    }
    throw e;
  }
  return { path: p, parsed: parseEnvFile(content) };
}
