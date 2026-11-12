'use strict';

/**
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
 * Requiring those paths (PR #137) false-positives a valid bundle and
 * blocked launch with "KeyShield cannot start".
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

  let executables = [];
  try {
    executables = fs.readdirSync(macos).filter((name) => !name.startsWith('.'));
  } catch {
    executables = [];
  }
  if (executables.length === 0) {
    missing.push(path.join(macos, 'KeyShield'));
  }

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

  const frameworkBin = path.join(
    frameworks,
    'Electron Framework.framework',
    'Electron Framework',
  );
  if (!exists(frameworkBin)) missing.push(frameworkBin);

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
        missing.push(path.join(helperMac, helper.replace(/\.app$/, '')));
      }
    }
  }

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
  verifyMacBundleRuntime,
  helperAppNames,
};
