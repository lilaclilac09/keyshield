'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { prepareMacBuild, macPackagerOptions, checkBundle, writeBuildInfo } = require('./pack-mac.cjs');

const desktop = path.resolve(__dirname, '..');
const output = path.join(desktop, 'release', 'mas');
const bundleId = 'xyz.aileena.keyshield';

function signingInputs(env = process.env) {
  const names = ['KS_MAS_APP_IDENTITY', 'KS_MAS_INSTALLER_IDENTITY', 'KS_MAS_PROVISIONING_PROFILE'];
  const signed = names.some((name) => env[name]);
  if (signed) {
    for (const name of [...names, 'KS_MAS_TEAM_ID', 'KS_MAS_BUILD_NUMBER', 'KS_MAS_NON_EXEMPT_ENCRYPTION']) {
      if (!env[name]) throw new Error(`${name} is required for App Store signing/pkg`);
    }
    if (!/^[A-Z0-9]{10}$/.test(env.KS_MAS_TEAM_ID)) throw new Error('Invalid KS_MAS_TEAM_ID');
    if (!fs.statSync(env.KS_MAS_PROVISIONING_PROFILE).isFile()) throw new Error('Provisioning profile must be a file');
  }
  if (env.KS_MAS_BUILD_NUMBER && !/^\d+(?:\.\d+){0,2}$/.test(env.KS_MAS_BUILD_NUMBER)) throw new Error('Invalid KS_MAS_BUILD_NUMBER');
  const declaration = env.KS_MAS_NON_EXEMPT_ENCRYPTION;
  if (declaration !== undefined && !['true', 'false'].includes(declaration)) throw new Error('KS_MAS_NON_EXEMPT_ENCRYPTION must be true or false');
  return { signed, declaration: declaration === undefined ? undefined : declaration === 'true' };
}

function assertBrokerExcluded(app) {
  const asar = require('@electron/asar');
  const resources = path.join(app, 'Contents', 'Resources');
  const files = asar.listPackage(path.join(resources, 'app.asar'));
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      files.push(file);
      if (entry.isDirectory()) walk(file);
    }
  };
  walk(resources);
  const forbidden = files.filter((file) => /(?:^|\/)(?:e2e|scripts)(?:\/|$)|(?:broker|approval|mock)[^/]*\.(?:c?js|json|html)$/i.test(file));
  if (forbidden.length) throw new Error(`Dev-only files in MAS bundle: ${forbidden.join(', ')}`);
  console.log('MAS broker-exclusion assertion: PASS');
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('MAS packaging requires macOS');
  const inputs = signingInputs();
  fs.mkdirSync(output, { recursive: true });
  const pkg = path.join(output, 'KeyShield-mas.pkg');
  fs.rmSync(pkg, { force: true });
  const { sources, rendererReport, icon } = prepareMacBuild();
  const options = macPackagerOptions(icon);
  const apps = await require('@electron/packager')({
    ...options,
    platform: 'mas',
    arch: 'universal',
    buildVersion: process.env.KS_MAS_BUILD_NUMBER || '1',
    out: output,
    extraResource: [...options.extraResource, path.join(desktop, 'build', 'beta-policy.json')],
    extendInfo: {
      ...options.extendInfo,
      LSMinimumSystemVersion: '12.0',
      CFBundleVersion: process.env.KS_MAS_BUILD_NUMBER || '1',
      ...(process.env.KS_MAS_TEAM_ID ? { ElectronTeamID: process.env.KS_MAS_TEAM_ID } : {}),
      ...(inputs.declaration === undefined ? {} : { ITSAppUsesNonExemptEncryption: inputs.declaration }),
    },
  });
  const app = path.join(apps[0], 'KeyShield.app');
  const policy = path.join(app, 'Contents', 'Resources', 'beta-policy.json');
  if (JSON.parse(fs.readFileSync(policy, 'utf8')).syntheticOnly !== true) throw new Error('MAS synthetic beta policy missing');
  fs.chmodSync(policy, 0o444);
  console.log('MAS baked synthetic-only policy assertion: PASS');
  assertBrokerExcluded(app);
  const report = checkBundle(app, 'mas-universal');
  let entitlements = fs.readFileSync(path.join(desktop, 'build', 'entitlements.mas.plist'), 'utf8');
  const team = process.env.KS_MAS_TEAM_ID;
  entitlements = entitlements.replace('MAS_APP_GROUP', `${inputs.signed ? `${team}.` : ''}${bundleId}`);
  entitlements = entitlements.replace('<!-- signing-identifiers -->', inputs.signed
    ? `<key>com.apple.application-identifier</key><string>${team}.${bundleId}</string>\n<key>com.apple.developer.team-identifier</key><string>${team}</string>` : '');
  const generated = path.join(output, 'entitlements.mas.plist');
  fs.writeFileSync(generated, entitlements);
  const inherit = path.join(desktop, 'build', 'entitlements.mas.inherit.plist');
  await require('@electron/osx-sign').signAsync({
    app,
    platform: 'mas',
    identity: inputs.signed ? process.env.KS_MAS_APP_IDENTITY : '-',
    identityValidation: inputs.signed,
    type: 'distribution',
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: inputs.signed,
    ...(inputs.signed ? { provisioningProfile: path.resolve(process.env.KS_MAS_PROVISIONING_PROFILE) } : {}),
    optionsForFile: (file) => ({ entitlements: file === app ? generated : inherit, hardenedRuntime: false }),
  });
  const info = writeBuildInfo([['mas-universal', report]], rendererReport.assets.length, sources, null, path.join(output, 'BUILD-INFO.txt'));
  fs.appendFileSync(info, `\n${inputs.signed ? 'MAS distribution signed — upload requires owner review' : 'Local synthetic MAS sandbox check — not App Store signed'}\n`);
  fs.appendFileSync(info, 'MAS launch log: ~/Library/Containers/xyz.aileena.keyshield/Data/Library/Logs/KeyShield/keyshield-desktop.log\n');
  if (inputs.signed) {
    execFileSync('productbuild', ['--component', app, '/Applications', '--sign', process.env.KS_MAS_INSTALLER_IDENTITY, pkg], { stdio: 'inherit' });
    console.log('pkg', pkg);
  } else {
    console.log('Ad-hoc sandbox app only; skipping App Store pkg');
  }
  console.log('MAS app', app);
}

if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });
module.exports = { signingInputs, assertBrokerExcluded };
