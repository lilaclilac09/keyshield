/**
 * `keyshield run <command> [args...]` — like `op run`. Reads .env,
 * spawns the command with env vars injected.
 *
 * Exit code is forwarded from the child process. Signals are
 * forwarded too: if the user Ctrl-C's, the child gets SIGINT and the
 * CLI exits with 130.
 */

import { spawn } from 'node:child_process';
import { loadEnv } from '../lib/load-env.js';

export interface RunOptions {
  envFile?: string;
  /** Default behaviour is to merge over process.env. Set true to wipe
   *  the process env first so only KeyShield-injected vars are visible. */
  clean?: boolean;
}

export async function runRun(
  argv: string[],
  opts: RunOptions = {},
): Promise<number> {
  if (argv.length === 0) {
    process.stderr.write('usage: keyshield run <command> [args...]\n');
    return 64;
  }

  const { parsed, path } = await loadEnv({ envFile: opts.envFile });

  const baseEnv = opts.clean ? {} : { ...process.env };
  const env: Record<string, string> = { ...baseEnv } as Record<string, string>;
  for (const [k, v] of parsed.values) env[k] = v;

  const [cmd, ...args] = argv;
  process.stderr.write(
    `[keyshield] injecting ${parsed.values.size} keys from ${path}\n`,
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
