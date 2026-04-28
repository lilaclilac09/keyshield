import { loadEnv } from '../lib/load-env.js';
import { lookupKey } from '../lib/env-file.js';

export interface GetOptions {
  envFile?: string;
}

export async function runGet(name: string, opts: GetOptions = {}): Promise<number> {
  const { parsed } = await loadEnv({ envFile: opts.envFile });
  const value = lookupKey(parsed, name);
  if (value === undefined) {
    process.stderr.write(`key "${name}" not found in env file\n`);
    return 1;
  }
  // Just the value, no newline-after handling — match `cat` semantics
  // so users can pipe directly: `keyshield get openai | jq -r ...`.
  process.stdout.write(value + '\n');
  return 0;
}
