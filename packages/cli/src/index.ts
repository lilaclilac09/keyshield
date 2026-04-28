#!/usr/bin/env node
/**
 * KeyShield CLI entrypoint. Phase 1 scope:
 *   - keyshield run <command> [args...]
 *   - keyshield get <name>
 *   - keyshield list
 *   - keyshield doctor
 *   - keyshield version
 *
 * The Phase 1 model: the popup exports `.env` (E2EE-decrypted in
 * the browser); this CLI reads that file and injects values into
 * an agent process. No new credential handling, no daemon.
 *
 * Phase 2 (later): `keyshield login` runs a localhost WebAuthn
 * dance so the CLI can decrypt directly without a popup roundtrip.
 */

import { Command } from 'commander';
import { runGet } from './commands/get.js';
import { runList } from './commands/list.js';
import { runRun } from './commands/run.js';
import { runDoctor } from './commands/doctor.js';

const program = new Command();
program
  .name('keyshield')
  .description(
    'Inject API keys from a popup-exported .env into an agent process.',
  )
  .version('0.1.0');

program
  .command('get <name>')
  .description('print the value of a single key')
  .option('-e, --env-file <path>', 'override the default .env path')
  .action(async (name: string, opts) => {
    process.exitCode = await runGet(name, opts);
  });

program
  .command('list')
  .description('list all key names (no values)')
  .option('-e, --env-file <path>', 'override the default .env path')
  .option('--json', 'output as JSON array')
  .action(async (opts) => {
    process.exitCode = await runList(opts);
  });

program
  .command('run')
  .description('run a command with vault keys injected as env vars')
  .option('-e, --env-file <path>', 'override the default .env path')
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
