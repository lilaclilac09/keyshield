'use strict';

/**
 * Builds the src/web dashboard and copies it into src/desktop/renderer,
 * where the pack script bundles it as an extra resource.
 *
 * Two things the previous version got wrong:
 *
 * 1. It ran a full `npm install` in src/web on every pack — slow,
 *    network-dependent, and it mutates the tree on every build. The install
 *    now runs only when node_modules is missing or package.json changed
 *    (tracked by a stamp file), and uses `npm ci` when a lockfile exists.
 * 2. It only checked that dist/index.html exists. The repo's own committed
 *    dist proves index.html can exist while its assets do not — and a
 *    renderer without its JavaScript opens to a blank window with no error.
 *    The build now verifies the whole output: index.html, a non-empty
 *    assets directory, and every local script/stylesheet the page
 *    references must resolve to a real file.
 */

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const webDir = path.join(repoRoot, 'src', 'web');
const dest = path.join(desktopDir, 'renderer');
const stampFile = path.join(desktopDir, '.renderer-install-stamp');

const env = {
  ...process.env,
  KEYSHIELD_API_URL:
    process.env.KEYSHIELD_API_URL || 'https://keyshield-production.up.railway.app',
  KEYSHIELD_PUBLIC_API_BASE:
    process.env.KEYSHIELD_PUBLIC_API_BASE || 'https://keyshield-production.up.railway.app',
  KEYSHIELD_SYNC_URL: process.env.KEYSHIELD_SYNC_URL || process.env.KEYSHIELD_PUBLIC_SYNC_URL || '',
  KEYSHIELD_PUBLIC_SYNC_URL: process.env.KEYSHIELD_PUBLIC_SYNC_URL || '',
};

function installStamp() {
  const hash = crypto.createHash('sha256');
  for (const name of ['package.json', 'package-lock.json']) {
    const file = path.join(webDir, name);
    if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex');
}

function nodeModulesFresh() {
  if (!fs.existsSync(path.join(webDir, 'node_modules'))) return false;
  if (!fs.existsSync(stampFile)) return false;
  try {
    return fs.readFileSync(stampFile, 'utf8').trim() === installStamp();
  } catch {
    return false;
  }
}

function installDependencies() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const lockfile = path.join(webDir, 'package-lock.json');
  const args = fs.existsSync(lockfile) ? ['ci'] : ['install'];
  const install = spawnSync(npm, args, { cwd: webDir, env, stdio: 'inherit' });
  if (install.status !== 0) process.exit(install.status || 1);
  fs.writeFileSync(stampFile, `${installStamp()}\n`);
}

/**
 * Verify a Vite output directory is complete: index.html exists, the
 * assets directory holds at least one script and one stylesheet, and every
 * local script/stylesheet the page references resolves to a real file.
 * Returns { ok, missing, assets }.
 */
function verifyRendererDist(dist) {
  const missing = [];
  const index = path.join(dist, 'index.html');
  if (!fs.existsSync(index)) {
    return { ok: false, missing: [index], assets: [] };
  }
  const html = fs.readFileSync(index, 'utf8');
  const assetsDir = path.join(dist, 'assets');
  const assets = [];
  try {
    for (const name of fs.readdirSync(assetsDir)) {
      const file = path.join(assetsDir, name);
      if (fs.statSync(file).isFile()) assets.push(file);
    }
  } catch {
    // Assets directory missing — reported below.
  }
  if (assets.length === 0) missing.push(assetsDir);
  if (!assets.some((file) => file.endsWith('.js'))) missing.push(path.join(assetsDir, '*.js'));
  if (!assets.some((file) => file.endsWith('.css'))) missing.push(path.join(assetsDir, '*.css'));
  const refs = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) refs.add(match[1]);
  for (const ref of refs) {
    if (/^https?:\/\//.test(ref)) continue;
    const file = path.join(dist, decodeURIComponent(ref));
    if (!fs.existsSync(file)) missing.push(file);
  }
  return { ok: missing.length === 0, missing, assets };
}

function main() {
  if (!fs.existsSync(path.join(webDir, 'package.json'))) {
    console.error('src/web/package.json missing');
    process.exit(1);
  }
  if (!nodeModulesFresh()) {
    console.log('installing src/web dependencies…');
    installDependencies();
  } else {
    console.log('src/web dependencies are up to date — skipping install');
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npm, ['run', 'build:vite'], { cwd: webDir, env, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status || 1);
  const dist = path.join(webDir, 'dist');
  const report = verifyRendererDist(dist);
  if (!report.ok) {
    console.error('renderer build is incomplete — refusing to ship it:');
    for (const file of report.missing) console.error(`  missing: ${file}`);
    console.error('Fix the src/web build, then run this again.');
    process.exit(1);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(dist, dest, { recursive: true });
  console.log(`renderer → ${dest} (${report.assets.length} assets)`);
}

if (require.main === module) main();

module.exports = { verifyRendererDist, installStamp, nodeModulesFresh };
