import { loadEnv } from '../lib/load-env.js';

export interface ListOptions {
  envFile?: string;
  /** When true, output as JSON `["KEY1", "KEY2", ...]`. */
  json?: boolean;
}

export async function runList(opts: ListOptions = {}): Promise<number> {
  const { parsed } = await loadEnv({ envFile: opts.envFile });
  const names = [...parsed.values.keys()].sort();
  if (opts.json) {
    process.stdout.write(JSON.stringify(names) + '\n');
  } else {
    for (const n of names) process.stdout.write(n + '\n');
  }
  return 0;
}
