import { resolveSource } from '../lib/source.js';

export interface ListOptions {
  envFile?: string;
  mode?: 'v2' | 'local';
  json?: boolean;
}

export async function runList(opts: ListOptions = {}): Promise<number> {
  const src = await resolveSource(opts);
  const names = await src.list();
  if (opts.json) {
    process.stdout.write(JSON.stringify(names) + '\n');
  } else {
    if (names.length === 0) {
      process.stderr.write(`(no keys in ${src.describe()})\n`);
    }
    for (const n of names) process.stdout.write(n + '\n');
  }
  return 0;
}
