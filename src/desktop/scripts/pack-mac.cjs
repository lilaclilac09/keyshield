'use strict';

/**
 * Pack unsigned KeyShield.app (+ zip, and a DMG when the host can make one).
 * Personal use: no Developer ID, no notarization.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { verifyMacBundleRuntime } = require('../runtime-preflight.cjs');

const desktopDir = path.resolve(__dirname, '..');
const releaseDir = path.join(desktopDir, 'release');
const outDir = path.join(desktopDir, 'out');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: desktopDir, ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
  }
}

function writePngIcon(dest) {
  const zlib = require('node:zlib');
  const w = 256;
  const h = 256;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 4;
      const cx = x - 128;
      const cy = y - 128;
      const inside = cx * cx + cy * cy < 90 * 90;
      raw[i] = inside ? 232 : 11;
      raw[i + 1] = inside ? 236 : 18;
      raw[i + 2] = inside ? 255 : 38;
      raw[i + 3] = 255;
    }
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const payload = Buffer.concat([Buffer.from(type), data]);
    let c = 0xffffffff;
    for (const b of payload) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, payload, crcBuf]);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(dest, png);
}

function copyOpenHelpers(destDir) {
  const commandSrc = path.join(desktopDir, 'Open-KeyShield.command');
  const readmeSrc = path.join(desktopDir, 'OPEN-ME.txt');
  const commandDest = path.join(destDir, 'Open-KeyShield.command');
  const readmeDest = path.join(destDir, 'OPEN-ME.txt');
  fs.copyFileSync(commandSrc, commandDest);
  fs.chmodSync(commandDest, 0o755);
  fs.copyFileSync(readmeSrc, readmeDest);
}

function stageAppBundle(sourceApp, destApp) {
  fs.rmSync(destApp, { recursive: true, force: true });
  // Keep helper-framework symlinks relative; default cpSync rewrites them to absolute
  // paths, which breaks icudtl.dat lookup after users move the app into /Applications.
  fs.cpSync(sourceApp, destApp, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    preserveTimestamps: true,
  });
  verifyMacBundleRuntime(destApp);
}

async function main() {
  run(process.execPath, [path.join(__dirname, 'build-renderer.cjs')]);

  const iconPng = path.join(desktopDir, 'icon.png');
  writePngIcon(iconPng);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  const packager = require('@electron/packager');
  const apps = await packager({
    dir: desktopDir,
    out: outDir,
    platform: 'darwin',
    arch: ['arm64', 'x64'],
    name: 'KeyShield',
    appBundleId: 'xyz.aileena.keyshield',
    appCategoryType: 'public.app-category.utilities',
    overwrite: true,
    prune: true,
    asar: { unpack: '**/preload.cjs' },
    extraResource: [
      path.join(desktopDir, 'renderer'),
      path.join(desktopDir, 'boot.html'),
    ],
    icon: iconPng,
    darwinDarkModeSupport: true,
    osxSign: false,
    ignore: (file) => {
      if (!file) return false;
      if (file === '/out' || file.startsWith('/out/')) return true;
      if (file === '/release' || file.startsWith('/release/')) return true;
      if (file.startsWith('/scripts')) return true;
      if (file === '/renderer' || file.startsWith('/renderer/')) return true;
      if (file === '/Open-KeyShield.command' || file === '/OPEN-ME.txt') return true;
      return false;
    },
    appCopyright: 'KeyShield',
    extendInfo: {
      NSFaceIDUsageDescription: 'Unlock KeyShield with Touch ID.',
      CFBundleDisplayName: 'KeyShield',
      CFBundleName: 'KeyShield',
      LSBackgroundOnly: false,
      LSUIElement: false,
    },
  });

  const zipped = [];
  for (const appDir of apps) {
    const appPath = path.join(appDir, 'KeyShield.app');
    const arch = appDir.includes('arm64') ? 'arm64' : 'x64';
    if (!fs.existsSync(appPath)) {
      console.warn('missing app at', appPath);
      continue;
    }
    verifyMacBundleRuntime(appPath);
    copyOpenHelpers(appDir);
    const zipName = `KeyShield-mac-${arch}.zip`;
    const zipPath = path.join(releaseDir, zipName);
    fs.rmSync(zipPath, { force: true });
    run('zip', ['-r', '-y', zipPath, 'KeyShield.app', 'Open-KeyShield.command', 'OPEN-ME.txt'], { cwd: appDir });
    zipped.push({ arch, appPath, zipPath });
    console.log('zip', zipPath);
  }

  const preferred = zipped.find((z) => z.arch === 'arm64') || zipped[0];
  if (preferred) {
    const dmgPath = path.join(releaseDir, 'KeyShield.dmg');
    fs.rmSync(dmgPath, { force: true });
    const staging = path.join(releaseDir, 'dmg-root');
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    stageAppBundle(preferred.appPath, path.join(staging, 'KeyShield.app'));
    copyOpenHelpers(staging);
    try {
      fs.symlinkSync('/Applications', path.join(staging, 'Applications'));
    } catch {
      /* ignore */
    }

    if (process.platform === 'darwin') {
      execFileSync('hdiutil', [
        'create',
        '-volname', 'KeyShield',
        '-srcfolder', staging,
        '-ov',
        '-format', 'UDZO',
        dmgPath,
      ], { stdio: 'inherit' });
      if (fs.existsSync(dmgPath)) console.log('dmg', dmgPath);
    } else {
      // Do not write KeyShield.dmg on Linux. A genisoimage ISO named .dmg
      // is not a launchable Mac app (and ISO mangles helper names if you
      // pack the raw .app). Ship the zip + Open-KeyShield.command instead.
      console.log('skip dmg on', process.platform, '— use', preferred.zipPath);
      console.log('Aileen: unzip KeyShield-mac-arm64.zip, then Open-KeyShield.command');
    }
  }

  console.log('packed', apps);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
