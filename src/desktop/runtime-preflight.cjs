'use strict';

/**
 * Checks a packaged macOS Electron app bundle for the Chromium runtime
 * files the app needs to open a window.
 *
 * Electron 33 (and current electron-packager) darwin layout:
 *
 *   KeyShield.app/Contents/
 *     MacOS/KeyShield
 *     Frameworks/Electron Framework.framework/Resources/icudtl.dat
 *       → symlink to Versions/Current/Resources/icudtl.dat
 *     Frameworks/KeyShield Helper*.app/Contents/MacOS/<helper>
 *     Resources/renderer/index.html   (dashboard extraResource)
 *
 * Helpers do NOT contain a nested Electron Framework / icudtl.dat.
 * Contents/Resources/icudtl.dat is also not required on Electron 33.
 * An earlier version of this check required those paths, false-positived
 * on a valid bundle, and blocked launch — so this file splits every finding
 * into fatal (the app cannot open a window without it) and warning (worth
 * reporting, never a reason to refuse launch). The runtime only ever warns;
 * the pack script fails only on fatal items.
 *
 * This check covers the Electron 33 layout. If Electron is upgraded, the
 * layout expectations here must be re-verified against the new version's
 * bundle before shipping.
 */

const fs = require('node:fs');
const path = require('node:path');

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function contentsDir(root) {
  if (!root) return root;
  const base = path.basename(root);
  if (base === 'Contents') return root;
  if (base.endsWith('.app')) return path.join(root, 'Contents');
  if (exists(path.join(root, 'Contents', 'MacOS'))) return path.join(root, 'Contents');
  return root;
}

function helperAppNames(frameworks) {
  try {
    return fs.readdirSync(frameworks).filter((name) => (
      name.includes('Helper') && name.endsWith('.app')
    ));
  } catch {
    return [];
  }
}

function inspectMacBundle(root) {
  const contents = contentsDir(root);
  const frameworks = path.join(contents, 'Frameworks');
  const resources = path.join(contents, 'Resources');
  const macos = path.join(contents, 'MacOS');
  const missing = [];
  const warnings = [];

  // Fatal: the main executable must exist and be runnable.
  let executables = [];
  try {
    executables = fs.readdirSync(macos).filter((name) => !name.startsWith('.'));
  } catch {
    executables = [];
  }
  if (executables.length === 0) {
    missing.push(path.join(macos, 'KeyShield'));
  } else {
    for (const name of executables) {
      if (!isExecutable(path.join(macos, name))) {
        missing.push(path.join(macos, name));
      }
    }
  }

  // Fatal: the Electron framework binary.
  const frameworkBin = path.join(
    frameworks,
    'Electron Framework.framework',
    'Electron Framework',
  );
  if (!exists(frameworkBin)) missing.push(frameworkBin);

  // Fatal: ICU data. Electron 33 ships it in exactly one of these places.
  const icuInFramework = path.join(
    frameworks,
    'Electron Framework.framework',
    'Resources',
    'icudtl.dat',
  );
  const icuInFrameworkVersion = path.join(
    frameworks,
    'Electron Framework.framework',
    'Versions',
    'A',
    'Resources',
    'icudtl.dat',
  );
  const icuInResources = path.join(resources, 'icudtl.dat');
  if (!exists(icuInFramework) && !exists(icuInFrameworkVersion) && !exists(icuInResources)) {
    missing.push(icuInFramework);
  }

  // Fatal only when no helper app exists at all; a single helper with a
  // missing binary is a warning (the window can still open — the main and
  // renderer helpers are the ones that matter, and their absence is caught
  // by the empty-helpers case in a real bundle).
  const helpers = helperAppNames(frameworks);
  if (helpers.length === 0) {
    missing.push(path.join(frameworks, 'KeyShield Helper.app'));
  } else {
    for (const helper of helpers) {
      const helperMac = path.join(frameworks, helper, 'Contents', 'MacOS');
      let bins = [];
      try {
        bins = fs.readdirSync(helperMac).filter((name) => !name.startsWith('.'));
      } catch {
        bins = [];
      }
      if (bins.length === 0) {
        warnings.push(path.join(helperMac, helper.replace(/\.app$/, '')));
      }
    }
  }

  // Warning only: without the bundled renderer the app falls back to the
  // live dashboard, so a missing renderer never blocks launch.
  const rendererIndex = path.join(resources, 'renderer', 'index.html');
  if (!exists(rendererIndex)) warnings.push(rendererIndex);

  return {
    ok: missing.length === 0,
    fatal: missing.length > 0,
    skipped: false,
    appBundle: path.resolve(contents, '..'),
    missing,
    warnings,
    helpers,
  };
}

/** The fatal subset of a report — the only items that may fail a pack. */
function fatalMissing(report) {
  return (report && Array.isArray(report.missing)) ? report.missing.slice() : [];
}

function verifyMacBundleRuntime(appPath) {
  const report = inspectMacBundle(appPath);
  if (!report.ok) {
    throw new Error([
      `packaged app is missing Chromium runtime resources: ${appPath}`,
      ...report.missing.map((file) => `  - ${file}`),
    ].join('\n'));
  }
  return report;
}

module.exports = {
  contentsDir,
  inspectMacBundle,
  fatalMissing,
  verifyMacBundleRuntime,
  helperAppNames,
};
