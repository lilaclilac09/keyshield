'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const webDir = path.join(repoRoot, 'src', 'web');
const dest = path.join(desktopDir, 'renderer');

const env = {
  ...process.env,
  KEYSHIELD_API_URL:
    process.env.KEYSHIELD_API_URL || 'https://keyshield-production.up.railway.app',
  KEYSHIELD_PUBLIC_API_BASE:
    process.env.KEYSHIELD_PUBLIC_API_BASE || 'https://keyshield-production.up.railway.app',
  KEYSHIELD_SYNC_URL: process.env.KEYSHIELD_SYNC_URL || process.env.KEYSHIELD_PUBLIC_SYNC_URL || '',
  KEYSHIELD_PUBLIC_SYNC_URL: process.env.KEYSHIELD_PUBLIC_SYNC_URL || '',
};

if (!fs.existsSync(path.join(webDir, 'package.json'))) {
  console.error('src/web/package.json missing');
  process.exit(1);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const install = spawnSync(npm, ['install'], { cwd: webDir, env, stdio: 'inherit' });
if (install.status !== 0) process.exit(install.status || 1);

const build = spawnSync(npm, ['run', 'build:vite'], { cwd: webDir, env, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);

const dist = path.join(webDir, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('src/web/dist/index.html missing after vite build');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(dist, dest, { recursive: true });
console.log(`renderer → ${dest}`);
