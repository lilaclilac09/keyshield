#!/usr/bin/env node
/**
 * GitNexus without a global `gitnexus` on PATH.
 * macOS zsh otherwise prints: command not found: gitnexus
 *
 *   node src/scripts/gitnexus.cjs impact "status_strip" --direction upstream
 *   node src/scripts/gitnexus.cjs detect-changes --scope all
 *   node src/scripts/gitnexus.cjs detect-changes --scope compare --base-ref main
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node src/scripts/gitnexus.cjs <analyze|impact|detect-changes|...> [flags]');
  process.exit(2);
}
if (!args.includes('--repo')) {
  args.push('--repo', repo);
}

const candidates = [
  ['gitnexus', args],
  ['npx', ['--yes', 'gitnexus', ...args]],
  ['bunx', ['gitnexus', ...args]],
  ['pnpm', ['dlx', 'gitnexus', ...args]],
];

for (const [cmd, argv] of candidates) {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', cwd: repo, env: process.env });
  if (r.error && r.error.code === 'ENOENT') continue;
  process.exit(r.status == null ? 1 : r.status);
}

console.error('gitnexus not found. Install: npm i -g gitnexus   or   npx gitnexus');
process.exit(127);
