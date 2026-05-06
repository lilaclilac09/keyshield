/**
 * KeyShield Manifest V3 packager.
 *
 * Pipeline:
 *   1. Run `vite build` (already produces the popup SPA in dist/popup/).
 *   2. Move dist/popup/index.html → dist/popup.html and dist/popup/assets/
 *      → dist/assets/ so the manifest's default_popup="popup.html"
 *      resolves at the extension root.
 *   3. esbuild content.ts → dist/content.js (IIFE, no chunks — Chrome
 *      requires content scripts to be a single file).
 *   4. esbuild background.ts → dist/background.js (ESM, MV3 module
 *      service worker).
 *   5. Write manifest.json from manifest.ts.
 *   6. Drop placeholder PNG icons (1×1 transparent) so Chrome doesn't
 *      reject the load. Real icons can replace them later.
 *
 * Output: dist/ is now a fully self-contained extension you can
 * "Load unpacked" in chrome://extensions.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const SRC = resolve(ROOT, 'src');

function step(msg) {
  console.log(`\n[build-ext] ${msg}`);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

// ─── 1. clean + run vite build for the popup ─────────────────────────────

step('clean dist/');
rmSync(DIST, { recursive: true, force: true });

step('vite build (popup SPA)');
run('npx', ['--no-install', 'vite', 'build']);

// vite.config.ts emits to dist/popup/. Lift the contents up one level so
// the manifest's "popup.html" resolves at the extension root.
step('flatten popup output');
const popupDir = resolve(DIST, 'popup');
if (!existsSync(popupDir)) {
  console.error('expected vite to emit', popupDir, 'but it is missing');
  process.exit(1);
}
renameSync(resolve(popupDir, 'index.html'), resolve(DIST, 'popup.html'));
if (existsSync(resolve(popupDir, 'assets'))) {
  cpSync(resolve(popupDir, 'assets'), resolve(DIST, 'assets'), { recursive: true });
}
rmSync(popupDir, { recursive: true, force: true });

// ─── 2. esbuild content + background ─────────────────────────────────────

const { build: esbuild } = await import('esbuild');

step('bundle content.ts');
await esbuild({
  entryPoints: [resolve(SRC, 'content.ts')],
  bundle: true,
  format: 'iife', // content scripts can't be ESM
  target: 'chrome120',
  outfile: resolve(DIST, 'content.js'),
  platform: 'browser',
  sourcemap: 'linked',
  minify: false, // keep readable for demo / debugging
  logLevel: 'info',
});

step('bundle background.ts');
await esbuild({
  entryPoints: [resolve(SRC, 'background.ts')],
  bundle: true,
  format: 'esm', // MV3 module service worker
  target: 'chrome120',
  outfile: resolve(DIST, 'background.js'),
  platform: 'browser',
  sourcemap: 'linked',
  minify: false,
  logLevel: 'info',
});

// ─── 3. emit manifest.json from manifest.ts ──────────────────────────────

step('emit manifest.json');
// We can't `import` a .ts file from .mjs without transforming first; the
// tsc on the box happily emits to a temp .mjs we then dynamic-import.
const manifestTs = resolve(ROOT, 'manifest.ts');
const manifestTmp = resolve(DIST, '.manifest.tmp.mjs');
await esbuild({
  entryPoints: [manifestTs],
  bundle: false,
  format: 'esm',
  target: 'node20',
  outfile: manifestTmp,
  platform: 'node',
  logLevel: 'silent',
});
const { default: manifest } = await import(manifestTmp + '?t=' + Date.now());
rmSync(manifestTmp, { force: true });
const manifestMapTmp = manifestTmp + '.map';
if (existsSync(manifestMapTmp)) rmSync(manifestMapTmp, { force: true });

writeFileSync(
  resolve(DIST, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);

// ─── 4. copy icons (regenerate with `python3 scripts/gen-icons.py`) ──────

step('copy icons from src/icons/');
mkdirSync(resolve(DIST, 'icons'), { recursive: true });
const iconSrc = resolve(SRC, 'icons');
if (existsSync(iconSrc)) {
  cpSync(iconSrc, resolve(DIST, 'icons'), { recursive: true });
} else {
  console.warn(
    '[build-ext] WARNING: src/icons/ missing — falling back to 1×1 placeholders. ' +
      'Run `python3 scripts/gen-icons.py` to generate real icons.',
  );
  const TINY_PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';
  const tinyPng = Buffer.from(TINY_PNG_B64, 'base64');
  for (const size of [16, 48, 128]) {
    writeFileSync(resolve(DIST, 'icons', `icon${size}.png`), tinyPng);
  }
}

// ─── 5. summary ──────────────────────────────────────────────────────────

step('done');
console.log(`
extension built → ${DIST}

Load it in Chrome:
  1. chrome://extensions
  2. Enable "Developer mode" (top-right)
  3. "Load unpacked" → pick:
       ${DIST}
`);
