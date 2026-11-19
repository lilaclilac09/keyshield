'use strict';

/**
 * Pack unsigned KeyShield.app (+ zip, and a DMG when the host can make one).
 * Personal use: no Developer ID, no notarization.
 *
 * What changed from the previous pack script:
 *
 * - Packaging validates renderer assets and runtime files; packaged startup
 *   failures show a local diagnostics screen instead of hosted content.
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
const { sourceRevision, withRendererSource, writeDmgBuildInfo, fetchPinnedRenderer } = require('./build-provenance.cjs');

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

function copyInstallNotes(destDir) {
  const readmeSrc = path.join(desktopDir, 'OPEN-ME.txt');
  const readmeDest = path.join(destDir, 'OPEN-ME.txt');
  fs.copyFileSync(readmeSrc, readmeDest);
}

function stageDmgContents(sourceApp, staging, buildInfo) {
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  stageAppBundle(sourceApp, path.join(staging, 'KeyShield.app'));
  copyInstallNotes(staging);
  fs.copyFileSync(buildInfo, path.join(staging, 'BUILD-INFO.txt'));
  fs.symlinkSync('/Applications', path.join(staging, 'Applications'));
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

function writeBuildInfo(reports, rendererAssets, sources, dmgSha256, dest = path.join(releaseDir, 'BUILD-INFO.txt')) {
  const lines = [
    'KeyShield Mac build',
    `date: ${sources.createdAt}`,
    `git: ${sources.desktop.commit}`,
    `desktop commit: ${sources.desktop.commit}`,
    `desktop tree: ${sources.desktop.tree}`,
    `desktop dirty: ${sources.desktop.dirty}`,
    `desktop repository dirty: ${sources.desktop.repositoryDirty}`,
    `renderer commit: ${sources.renderer.commit}`,
    `renderer parents: ${sources.renderer.parents.join(' ') || 'none'}`,
    `renderer commit tree: ${sources.renderer.commitTree}`,
    `renderer inputs: ${JSON.stringify(sources.renderer.inputs || {})}`,
    `renderer tree: ${sources.renderer.tree}`,
    `renderer dirty: ${sources.renderer.dirty}`,
    `renderer repository dirty: ${sources.renderer.repositoryDirty}`,
    `dmg sha256: ${dmgSha256 || 'see external KeyShield.dmg.build-info.json (available after image creation)'}`,
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
  fs.writeFileSync(dest, `${lines.join('\n')}\n`);
  return dest;
}

function zipApp(appDir, zipPath) {
  fs.rmSync(zipPath, { force: true });
  if (process.platform === 'darwin') {
    run('ditto', ['-c', '-k', '--sequesterRsrc', appDir, zipPath]);
  } else {
    run('zip', ['-r', '-y', zipPath, 'KeyShield.app', 'OPEN-ME.txt', 'BUILD-INFO.txt'], { cwd: appDir });
  }
}

async function main() {
  const pin = JSON.parse(fs.readFileSync(process.env.KS_RENDERER_PIN || path.join(desktopDir, 'renderer-inputs.json'), 'utf8'));
  if (process.env.KS_RENDERER_REF && process.env.KS_RENDERER_REF !== pin.commit) throw new Error('KS_RENDERER_REF does not match renderer pin');
  const rendererRef = fetchPinnedRenderer(repoRoot, pin);
  const sources = {
    createdAt: new Date().toISOString(),
    desktop: sourceRevision(repoRoot, 'src/desktop'),
  };
  sources.renderer = withRendererSource(repoRoot, rendererRef, (root, dist) => {
    const revision = sourceRevision(root, 'src/web');
    revision.inputs = pin.inputs;
    run(process.execPath, [path.join(__dirname, 'build-renderer.cjs')], {
      env: { ...process.env, KS_RENDERER_SOURCE_ROOT: root, KS_RENDERER_DIST_DIR: dist || '' },
    });
    return revision;
  });

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
      path.join(desktopDir, 'redaction.js'),
    ],
    icon: icns || iconPng,
    darwinDarkModeSupport: true,
    osxSign: false,
    ignore: (file) => {
      if (!file) return false;
      if (file === '/out' || file.startsWith('/out/')) return true;
      if (file === '/release' || file.startsWith('/release/')) return true;
      if (file.startsWith('/scripts')) return true;
      if (file === '/e2e' || file.startsWith('/e2e/')) return true;
      if (file === '/renderer' || file.startsWith('/renderer/')) return true;
      if (file === '/OPEN-ME.txt') return true;
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
    copyInstallNotes(appDir);
    const zipName = `KeyShield-mac-${arch}.zip`;
    const zipPath = path.join(releaseDir, zipName);
    // BUILD-INFO.txt is written below; copy it into the app dir first so
    // the zip carries it. The copy happens after the file exists.
    zipped.push({ arch, appDir, appPath, zipPath });
    console.log('packed', appPath);
  }

  const buildInfo = writeBuildInfo(reports, rendererReport.assets.length, sources);
  for (const entry of zipped) {
    fs.copyFileSync(buildInfo, path.join(entry.appDir, 'BUILD-INFO.txt'));
    zipApp(entry.appDir, entry.zipPath);
    console.log('zip', entry.zipPath);
  }

  const preferred = zipped.find((z) => z.arch === 'arm64') || zipped[0];
  if (preferred) {
    const dmgPath = path.join(releaseDir, 'KeyShield.dmg');
    fs.rmSync(dmgPath, { force: true });
    fs.rmSync(`${dmgPath}.build-info.json`, { force: true });
    const staging = path.join(releaseDir, 'dmg-root');
    stageDmgContents(preferred.appPath, staging, buildInfo);

    if (process.platform === 'darwin') {
      execFileSync('hdiutil', [
        'create',
        '-volname', 'KeyShield',
        '-srcfolder', staging,
        '-ov',
        '-format', 'UDZO',
        dmgPath,
      ], { stdio: 'inherit' });
      const info = writeDmgBuildInfo(dmgPath, sources);
      writeBuildInfo(reports, rendererReport.assets.length, sources, info.sha256);
      console.log('dmg', dmgPath);
    } else {
      // Do not write KeyShield.dmg on Linux. A genisoimage ISO named .dmg
      // is not a launchable Mac app. Ship the zip instead.
      console.log('skip dmg on', process.platform, '— use', preferred.zipPath);
    }
  }

  console.log('packed', apps);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { writeBuildInfo, stageDmgContents };
