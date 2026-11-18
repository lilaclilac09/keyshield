'use strict';

/**
 * Pack unsigned KeyShield.app (+ zip, and a DMG when the host can make one).
 * Personal use: no Developer ID, no notarization.
 *
 * What changed from the previous pack script:
 *
 * - The bundle check is fatal-only: a missing renderer is a warning (the
 *   app falls back to the live dashboard), while a missing main executable,
 *   framework binary or ICU data still fails the pack. The runtime check
 *   never blocks launch at all — it only warns.
 * - The icon is a real .icns when built on macOS (generated from the same
 *   in-code artwork at every size iconutil needs). Other platforms keep
 *   the PNG with a warning.
 * - Zips are made with ditto on macOS, which preserves symlinks,
 *   permissions and macOS metadata; other platforms fall back to
 *   `zip -r -y`.
 * - Every pack writes release/BUILD-INFO.txt (Electron version, git
 *   commit, date, renderer asset count, preflight report) and includes it
 *   in the zip and the DMG, so a bad build can be told apart from a good
 *   one after the fact.
 */

const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { inspectMacBundle, verifyMacBundleRuntime } = require('../runtime-preflight.cjs');
const { hasRenderer } = require('../renderer-server.cjs');
const { verifyRendererDist } = require('./build-renderer.cjs');

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const releaseDir = path.join(desktopDir, 'release');
const outDir = path.join(desktopDir, 'out');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: desktopDir, ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
  }
}

function drawIconPng(size) {
  const zlib = require('node:zlib');
  const w = size;
  const h = size;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const radius = (size * 90) / 256;
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 4;
      const cx = x - size / 2;
      const cy = y - size / 2;
      const inside = cx * cx + cy * cy < radius * radius;
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
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function writePngIcon(dest) {
  fs.writeFileSync(dest, drawIconPng(256));
}

/**
 * Build a real .icns from the in-code artwork. Returns the .icns path, or
 * null when iconutil is unavailable (non-macOS) so the caller falls back
 * to the PNG with a warning.
 */
function makeIcns() {
  if (process.platform !== 'darwin') return null;
  const iconset = path.join(desktopDir, 'KeyShield.iconset');
  const icns = path.join(desktopDir, 'KeyShield.icns');
  try {
    fs.rmSync(iconset, { recursive: true, force: true });
    fs.mkdirSync(iconset, { recursive: true });
    const sizes = [
      ['icon_16x16.png', 16],
      ['icon_16x16@2x.png', 32],
      ['icon_32x32.png', 32],
      ['icon_32x32@2x.png', 64],
      ['icon_128x128.png', 128],
      ['icon_128x128@2x.png', 256],
      ['icon_256x256.png', 256],
      ['icon_256x256@2x.png', 512],
      ['icon_512x512.png', 512],
      ['icon_512x512@2x.png', 1024],
    ];
    for (const [name, size] of sizes) {
      fs.writeFileSync(path.join(iconset, name), drawIconPng(size));
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns], { stdio: 'inherit' });
    return icns;
  } catch (err) {
    console.warn(`iconutil failed (${err instanceof Error ? err.message : String(err)}) — using PNG icon`);
    return null;
  } finally {
    fs.rmSync(iconset, { recursive: true, force: true });
  }
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

/** Print preflight warnings and fail only on fatal (missing) items. */
function checkBundle(appPath, label) {
  const report = inspectMacBundle(appPath);
  for (const warning of report.warnings || []) {
    console.warn(`${label}: warning: ${warning}`);
  }
  verifyMacBundleRuntime(appPath);
  return report;
}

function electronVersion() {
  try {
    return require('electron/package.json').version;
  } catch {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
      return String(pkg.devDependencies?.electron || 'unknown');
    } catch {
      return 'unknown';
    }
  }
}

function gitCommit() {
  try {
    const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

function writeBuildInfo(reports, rendererAssets) {
  const lines = [
    'KeyShield Mac build',
    `date: ${new Date().toISOString()}`,
    `git: ${gitCommit()}`,
    `electron: ${electronVersion()}`,
    `platform: ${process.platform} ${process.arch}`,
    `renderer assets: ${rendererAssets}`,
    '',
    'preflight:',
  ];
  for (const [label, report] of reports) {
    lines.push(`  ${label}: ok=${report.ok} missing=${JSON.stringify(report.missing || [])} warnings=${JSON.stringify(report.warnings || [])}`);
  }
  lines.push('', 'If the app does not open, copy this file and the launch log');
  lines.push('~/Library/Logs/KeyShield/keyshield-desktop.log when reporting it.');
  const dest = path.join(releaseDir, 'BUILD-INFO.txt');
  fs.writeFileSync(dest, `${lines.join('\n')}\n`);
  return dest;
}

function zipApp(appDir, zipPath) {
  fs.rmSync(zipPath, { force: true });
  if (process.platform === 'darwin') {
    run('ditto', ['-c', '-k', '--sequesterRsrc', appDir, zipPath]);
  } else {
    run('zip', ['-r', '-y', zipPath, 'KeyShield.app', 'Open-KeyShield.command', 'OPEN-ME.txt', 'BUILD-INFO.txt'], { cwd: appDir });
  }
}

async function main() {
  run(process.execPath, [path.join(__dirname, 'build-renderer.cjs')]);

  const rendererDir = path.join(desktopDir, 'renderer');
  if (!hasRenderer(rendererDir)) {
    throw new Error('src/desktop/renderer/index.html is missing after the build — refusing to pack a blank app');
  }
  const rendererReport = verifyRendererDist(rendererDir);
  if (!rendererReport.ok) {
    throw new Error(`bundled renderer is incomplete: ${rendererReport.missing.join(', ')}`);
  }

  const iconPng = path.join(desktopDir, 'icon.png');
  writePngIcon(iconPng);
  const icns = makeIcns();
  if (!icns) console.warn('no .icns icon — the app will use the PNG icon instead');

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
    icon: icns || iconPng,
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

  const reports = [];
  const zipped = [];
  for (const appDir of apps) {
    const appPath = path.join(appDir, 'KeyShield.app');
    const arch = appDir.includes('arm64') ? 'arm64' : 'x64';
    if (!fs.existsSync(appPath)) {
      console.warn('missing app at', appPath);
      continue;
    }
    reports.push([arch, checkBundle(appPath, arch)]);
    copyOpenHelpers(appDir);
    const zipName = `KeyShield-mac-${arch}.zip`;
    const zipPath = path.join(releaseDir, zipName);
    // BUILD-INFO.txt is written below; copy it into the app dir first so
    // the zip carries it. The copy happens after the file exists.
    zipped.push({ arch, appDir, appPath, zipPath });
    console.log('packed', appPath);
  }

  const buildInfo = writeBuildInfo(reports, rendererReport.assets.length);
  for (const entry of zipped) {
    fs.copyFileSync(buildInfo, path.join(entry.appDir, 'BUILD-INFO.txt'));
    zipApp(entry.appDir, entry.zipPath);
    console.log('zip', entry.zipPath);
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
    fs.copyFileSync(buildInfo, path.join(staging, 'BUILD-INFO.txt'));
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
      console.log('Unzip KeyShield-mac-arm64.zip, then right-click Open-KeyShield.command → Open');
    }
  }

  console.log('packed', apps);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
