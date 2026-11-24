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
const sourceRoot = process.env.KS_RENDERER_SOURCE_ROOT || repoRoot;
const webDir = path.join(sourceRoot, 'src', 'web');
const dest = path.join(desktopDir, 'renderer');
const stampFile = path.join(desktopDir, '.renderer-install-stamp');

const env = {
  ...process.env,
  KEYSHIELD_API_URL:
    process.env.KEYSHIELD_API_URL || 'https://api.ks.aileena.xyz',
  KEYSHIELD_PUBLIC_API_BASE:
    process.env.KEYSHIELD_PUBLIC_API_BASE || 'https://api.ks.aileena.xyz',
  KEYSHIELD_SYNC_URL: process.env.KEYSHIELD_SYNC_URL || process.env.KEYSHIELD_PUBLIC_SYNC_URL || '',
  KEYSHIELD_PUBLIC_SYNC_URL: process.env.KEYSHIELD_PUBLIC_SYNC_URL || '',
};

function installStamp() {
  const hash = crypto.createHash('sha256');
  for (const file of [path.join(webDir, 'package.json'), path.join(webDir, 'package-lock.json'), path.join(sourceRoot, 'package-lock.json')]) {
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
  const installRoot = fs.existsSync(path.join(sourceRoot, 'package-lock.json')) ? sourceRoot : webDir;
  const lockfile = path.join(installRoot, 'package-lock.json');
  const args = fs.existsSync(lockfile) ? ['ci'] : ['install'];
  const install = spawnSync(npm, args, { cwd: installRoot, env, stdio: 'inherit' });
  if (install.status !== 0) throw new Error(`renderer dependency installation failed (${install.status})`);
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

function rendererPolicyRevision() {
  const file = 'src/desktop/host-deploy.ts';
  return { file, target: 'src/web/lib/host-deploy.ts', sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, file))).digest('hex') };
}

function rendererPolicyPlugin(root = sourceRoot, readPolicy = fs.readFileSync) {
  const policy = rendererPolicyRevision();
  const target = path.resolve(root, policy.target);
  const targets = new Set([target, fs.realpathSync(target)]);
  return {
    name: 'keyshield-desktop-endpoint-policy',
    enforce: 'pre',
    load(id) {
      if (!targets.has(path.resolve(id.split('?')[0]))) return null;
      return readPolicy(path.join(repoRoot, policy.file), 'utf8');
    },
  };
}

function main() {
  if (!fs.existsSync(path.join(webDir, 'package.json'))) {
    console.error('src/web/package.json missing');
    throw new Error('src/web/package.json missing');
  }
  if (!nodeModulesFresh()) {
    console.log('installing src/web dependencies…');
    installDependencies();
  } else {
    console.log('src/web dependencies are up to date — skipping install');
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const dist = process.env.KS_RENDERER_DIST_DIR || path.join(webDir, 'dist');
  const build = spawnSync(npm, ['run', 'build:vite', '--', '--config', path.join(__dirname, 'renderer-vite.config.mjs'), '--outDir', dist], { cwd: webDir, env, stdio: 'inherit' });
  if (build.status !== 0) throw new Error(`renderer build failed (${build.status})`);
  const report = verifyRendererDist(dist);
  if (!report.ok) {
    console.error('renderer build is incomplete — refusing to ship it:');
    for (const file of report.missing) console.error(`  missing: ${file}`);
    console.error('Fix the src/web build, then run this again.');
    throw new Error('renderer build is incomplete');
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(dist, dest, { recursive: true });
  console.log(`renderer → ${dest} (${report.assets.length} assets)`);
}

if (require.main === module) main();

module.exports = { verifyRendererDist, installStamp, nodeModulesFresh, rendererPolicyPlugin, rendererPolicyRevision, env };
