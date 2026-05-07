/**
 * `keyshield doctor` — sanity check the user's environment.
 * Reports rather than fixes. Exits non-zero if any check FAILS
 * (so it can be wired into CI), zero on warnings only.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveEnvPath, loadEnv } from '../lib/load-env.js';
import { inspectGitignore } from '../lib/gitignore.js';

interface Check {
  status: 'ok' | 'warn' | 'fail';
  label: string;
  detail?: string;
}

export interface DoctorOptions {
  envFile?: string;
  /** When true, also append `.env` to .gitignore if missing. */
  fix?: boolean;
}

export async function runDoctor(opts: DoctorOptions = {}): Promise<number> {
  const checks: Check[] = [];

  // 1. Does an env file exist where we'd look?
  const envPath = await resolveEnvPath({ envFile: opts.envFile });
  let envExists = false;
  try {
    await fs.access(envPath);
    envExists = true;
    checks.push({ status: 'ok', label: `env file: ${envPath}` });
  } catch {
    checks.push({
      status: 'fail',
      label: `env file: missing`,
      detail: `expected at ${envPath}. Export from the popup first.`,
    });
  }

  // 2. Does it parse cleanly?
  if (envExists) {
    try {
      const { parsed } = await loadEnv({ envFile: opts.envFile });
      if (parsed.warnings.length > 0) {
        checks.push({
          status: 'warn',
          label: `parser warnings: ${parsed.warnings.length}`,
          detail: parsed.warnings
            .slice(0, 3)
            .map((w) => `  line ${w.line}: ${w.reason}`)
            .join('\n'),
        });
      } else {
        checks.push({
          status: 'ok',
          label: `parses cleanly: ${parsed.values.size} keys`,
        });
      }
    } catch (e: any) {
      checks.push({
        status: 'fail',
        label: 'parse failed',
        detail: e?.message ?? String(e),
      });
    }
  }

  // 3. Is .env in .gitignore?
  const cwd = path.dirname(envPath);
  const gi = await inspectGitignore(cwd);
  if (!gi.exists) {
    checks.push({
      status: 'warn',
      label: '.gitignore: missing in this directory',
      detail: 'create one and add `.env` so it never gets committed.',
    });
  } else if (gi.ignoresEnv || gi.ignoresEnvGlob) {
    checks.push({ status: 'ok', label: '.gitignore: covers .env' });
  } else {
    checks.push({
      status: opts.fix ? 'ok' : 'fail',
      label: opts.fix
        ? '.gitignore: was missing .env — added'
        : '.gitignore: does NOT ignore .env',
      detail: opts.fix ? undefined : 'run `keyshield doctor --fix` to add it.',
    });
    if (opts.fix) {
      const { ensureGitignoresEnv } = await import('../lib/gitignore.js');
      await ensureGitignoresEnv(cwd);
    }
  }

  for (const c of checks) {
    const sym = c.status === 'ok' ? '✓' : c.status === 'warn' ? '!' : '✗';
    process.stdout.write(`[${sym}] ${c.label}\n`);
    if (c.detail) {
      for (const line of c.detail.split('\n')) {
        process.stdout.write(`    ${line}\n`);
      }
    }
  }

  return checks.some((c) => c.status === 'fail') ? 1 : 0;
}
