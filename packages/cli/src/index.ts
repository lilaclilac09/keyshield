#!/usr/bin/env node
/**
 * KeyShield CLI entrypoint. Two source modes:
 *
 *   1. Logged in to a v2-mvp server (the FastAPI proxy at
 *      v2-mvp/src/server.py — same backend the Next.js frontend
 *      talks to). Use `keyshield login` first.
 *
 *   2. Local .env file (the popup's "Export .env" output, or any
 *      hand-written one). Default when there's no active session.
 *
 * Commands automatically pick the right source. Force one with
 * `--mode v2` or `--mode local`.
 */

import { Command } from 'commander';
import { runGet } from './commands/get.js';
import { runList } from './commands/list.js';
import { runRun } from './commands/run.js';
import { runDoctor } from './commands/doctor.js';
import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runStatus } from './commands/status.js';

const program = new Command();
program
  .name('keyshield')
  .description(
    'Inject API keys into agent processes from either a v2-mvp ' +
      'server session or a popup-exported .env file.',
  )
  .version('0.2.0');

// ─── auth ────────────────────────────────────────────────────────────
program
  .command('login')
  .description('authenticate against a v2-mvp server (POST /auth/login)')
  .option('-s, --server <url>', 'v2-mvp base URL (or $KEYSHIELD_SERVER)')
  .option('-u, --user <id>', 'user id (or $KEYSHIELD_USER)')
  .option(
    '--password <pw>',
    'password (or $KEYSHIELD_PASSWORD; otherwise prompted)',
  )
  .action(async (opts) => {
    process.exitCode = await runLogin(opts);
  });

program
  .command('logout')
  .description('clear the local session (calls server /auth/logout best-effort)')
  .action(async () => {
    process.exitCode = await runLogout();
  });

program
  .command('status')
  .description('show current source mode (logged in vs local .env)')
  .action(async () => {
    process.exitCode = await runStatus();
  });

// ─── source-aware ────────────────────────────────────────────────────
program
  .command('get <name>')
  .description('print the value of a single key')
  .option('-e, --env-file <path>', 'override the local-mode .env path')
  .option('--mode <m>', 'force "v2" or "local"')
  .action(async (name: string, opts) => {
    process.exitCode = await runGet(name, opts);
  });

program
  .command('list')
  .description('list all key names (no values)')
  .option('-e, --env-file <path>', 'override the local-mode .env path')
  .option('--mode <m>', 'force "v2" or "local"')
  .option('--json', 'output as JSON array')
  .action(async (opts) => {
    process.exitCode = await runList(opts);
  });

program
  .command('run')
  .description('run a command with vault keys injected as env vars')
  .option('-e, --env-file <path>', 'override the local-mode .env path')
  .option('--mode <m>', 'force "v2" or "local"')
  .option('--clean', 'wipe parent process env before injecting')
  .allowUnknownOption(true)
  .argument('<command...>', 'command and args to run')
  .action(async (cmd: string[], opts) => {
    process.exitCode = await runRun(cmd, opts);
  });

program
  .command('doctor')
  .description('check that .env exists, parses, and is gitignored')
  .option('-e, --env-file <path>', 'override the default .env path')
  .option('--fix', 'amend .gitignore in place if it is missing .env')
  .action(async (opts) => {
    process.exitCode = await runDoctor(opts);
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`[keyshield] ${err?.message ?? err}\n`);
  process.exit(1);
});
