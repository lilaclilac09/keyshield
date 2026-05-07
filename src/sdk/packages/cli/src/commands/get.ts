import { resolveSource, KeyNotFoundError } from '../lib/source.js';

export interface GetOptions {
  envFile?: string;
  mode?: 'v2' | 'local';
}

export async function runGet(name: string, opts: GetOptions = {}): Promise<number> {
  const src = await resolveSource(opts);
  try {
    const value = await src.get(name);
    process.stdout.write(value + '\n');
    return 0;
  } catch (e) {
    if (e instanceof KeyNotFoundError) {
      process.stderr.write(`key "${name}" not found in ${src.describe()}\n`);
      return 1;
    }
    throw e;
  }
}
