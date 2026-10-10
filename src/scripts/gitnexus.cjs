#!/usr/bin/env node
/**
 * GitNexus without a global `gitnexus` on PATH.
 * macOS zsh otherwise prints: command not found: gitnexus
 *
 * Must run from (or point at) the keyshield clone — not $HOME:
 *
 *   cd /path/to/keyshield
 *   node src/scripts/gitnexus.cjs impact "status_strip" --direction upstream
 *   node src/scripts/gitnexus.cjs detect-changes --scope all
 *   npm run gitnexus -- impact status_strip --direction upstream
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);

function usage(code, extra) {
  if (extra) console.error(extra);
  console.error(`GitNexus is not installed as a global binary (macOS PATH has no \`gitnexus\`).

Wrong — from $HOME (~):
  ~ % gitnexus impact "<符号>"
      → zsh: command not found: gitnexus
  ~ % node src/scripts/gitnexus.cjs impact "status_strip" --direction upstream
      → Cannot find module '/Users/you/src/scripts/gitnexus.cjs'
        (relative path is resolved from $HOME, not the repo)

Right — cd into the clone first (prompt must not be ~):
  cd /path/to/keyshield
  node src/scripts/gitnexus.cjs impact "status_strip" --direction upstream
  node src/scripts/gitnexus.cjs detect-changes --scope all
  npm run gitnexus -- impact status_strip --direction upstream

Do not paste <符号>. Use a real symbol: status_strip, fetch_wallet_balances, App.

Optional ~/.zshrc (absolute path to THIS clone):
  alias gitnexus='node ${repo}/src/scripts/gitnexus.cjs'
`);
  process.exit(code);
}

if (args.length === 0) usage(2);

const impactAt = args.indexOf('impact');
if (impactAt >= 0) {
  const target = args[impactAt + 1] || '';
  const placeholder =
    !target ||
    target.startsWith('<') ||
    target === '符号' ||
    /^<.+>$/.test(target) ||
    target === 'symbolName' ||
    target === 'SYMBOL';
  if (placeholder) {
    usage(2, `impact target ${JSON.stringify(target)} is a placeholder, not a symbol.`);
  }
}

if (!fs.existsSync(path.join(repo, 'src', 'scripts', 'gitnexus.cjs'))) {
  usage(2, `wrapper not inside a keyshield clone (resolved repo=${repo})`);
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

console.error('gitnexus runner not found. From the repo: npx --yes gitnexus  (or bunx / pnpm dlx)');
process.exit(127);
