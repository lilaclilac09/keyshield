/**
 * `keyshield run <command> [args...]` — like `op run`. Resolves the
 * source (logged-in v2-mvp server, or local .env), pulls all keys,
 * spawns the command with them injected as env vars.
 *
 * Exit code is forwarded from the child process. Signals are
 * forwarded too: if the user Ctrl-C's, the child gets SIGINT and the
 * CLI exits with 130.
 */

import { spawn } from 'node:child_process';
import { resolveSource } from '../lib/source.js';

export interface RunOptions {
  envFile?: string;
  mode?: 'v2' | 'local';
  /** Default behaviour is to merge over process.env. Set true to wipe
   *  the process env first so only KeyShield-injected vars are visible. */
  clean?: boolean;
}

function envify(name: string): string {
  // Mirror the popup's formatter: foo-bar → FOO_BAR, drop unsafe chars,
  // prefix leading digits. Used for v2-mvp upstreams which are stored
  // with lowercase slugs like "openai".
  let out = name
    .replace(/[\s./\\-]+/g, '_')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '');
  if (out.length > 0 && /^[0-9]/.test(out)) out = '_' + out;
  return out;
}

export async function runRun(
  argv: string[],
  opts: RunOptions = {},
): Promise<number> {
  if (argv.length === 0) {
    process.stderr.write('usage: keyshield run <command> [args...]\n');
    return 64;
  }

  const src = await resolveSource(opts);
  const all = await src.getAll();

  const baseEnv = opts.clean ? {} : { ...process.env };
  const env: Record<string, string> = { ...baseEnv } as Record<string, string>;
  for (const [k, v] of all) {
    // Locally-sourced keys are already env-shaped (FOO_BAR=value) by
    // the popup's writer. v2-sourced keys are slug-shaped (openai)
    // and need normalizing.
    const target = /^[A-Z_][A-Z0-9_]*$/.test(k) ? k : envify(k);
    if (target.length > 0) env[target] = v;
  }

  const [cmd, ...args] = argv;
  process.stderr.write(
    `[keyshield] injecting ${all.size} keys from ${src.describe()}\n`,
  );

  return new Promise<number>((resolve) => {
    const child = spawn(cmd, args, {
      env,
      stdio: 'inherit',
      shell: false,
    });

    const forwardSignal = (signal: NodeJS.Signals) => {
      if (!child.killed) child.kill(signal);
    };
    process.on('SIGINT', () => forwardSignal('SIGINT'));
    process.on('SIGTERM', () => forwardSignal('SIGTERM'));

    child.on('error', (err: any) => {
      if (err?.code === 'ENOENT') {
        process.stderr.write(`[keyshield] command not found: ${cmd}\n`);
        resolve(127);
      } else {
        process.stderr.write(`[keyshield] spawn error: ${err?.message ?? err}\n`);
        resolve(1);
      }
    });
    child.on('close', (code, signal) => {
      if (signal === 'SIGINT') resolve(130);
      else resolve(code ?? 0);
    });
  });
}
