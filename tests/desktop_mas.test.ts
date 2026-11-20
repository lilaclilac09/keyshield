import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { signingInputs, assertBrokerExcluded } = require('../src/desktop/scripts/pack-mas.cjs');
const { macPackagerOptions } = require('../src/desktop/scripts/pack-mac.cjs');
const asar = require('../src/desktop/node_modules/@electron/asar');

describe('MAS packaging', () => {
  it('defaults to ad-hoc without guessing the legal encryption declaration', () => {
    expect(signingInputs({})).toEqual({ signed: false, declaration: undefined });
    expect(signingInputs({ KS_MAS_NON_EXEMPT_ENCRYPTION: 'false' }).declaration).toBe(false);
    expect(signingInputs({ KS_MAS_NON_EXEMPT_ENCRYPTION: 'true' }).declaration).toBe(true);
  });

  it('rejects partial signing inputs, invalid versions and declarations', () => {
    expect(() => signingInputs({ KS_MAS_APP_IDENTITY: 'Apple Distribution: Test' })).toThrow('KS_MAS_INSTALLER_IDENTITY');
    expect(() => signingInputs({ KS_MAS_BUILD_NUMBER: 'bad' })).toThrow('KS_MAS_BUILD_NUMBER');
    expect(() => signingInputs({ KS_MAS_NON_EXEMPT_ENCRYPTION: 'no' })).toThrow('true or false');
  });

  it('requires an explicit legal declaration for distribution signing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ks-mas-inputs-'));
    const profile = join(dir, 'test.provisionprofile');
    writeFileSync(profile, 'fixture');
    const env = {
      KS_MAS_APP_IDENTITY: 'Apple Distribution: Test', KS_MAS_INSTALLER_IDENTITY: 'Mac Installer Distribution: Test',
      KS_MAS_PROVISIONING_PROFILE: profile, KS_MAS_TEAM_ID: 'ABCDEFGHIJ', KS_MAS_BUILD_NUMBER: '42',
    };
    try {
      expect(() => signingInputs(env)).toThrow('KS_MAS_NON_EXEMPT_ENCRYPTION');
      expect(signingInputs({ ...env, KS_MAS_NON_EXEMPT_ENCRYPTION: 'false' }).signed).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('preserves DMG defaults and excludes development resources', () => {
    const options = macPackagerOptions('icon.icns');
    expect(options.platform).toBe('darwin');
    expect(options.arch).toEqual(['arm64', 'x64']);
    expect(options.osxSign).toBe(false);
    expect(options.extraResource.map((file: string) => file.split('/').pop())).toEqual(['renderer', 'boot.html', 'loading.html', 'redaction.js']);
    for (const file of ['/scripts/mock.cjs', '/e2e/keys.json', '/release/a', '/out/a']) expect(options.ignore(file)).toBe(true);
    expect(options.ignore('/main.cjs')).toBe(false);
  });

  it('accepts a clean bundle and rejects packaged broker files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ks-mas-exclusion-'));
    const resources = join(dir, 'KeyShield.app', 'Contents', 'Resources');
    const source = join(dir, 'source');
    mkdirSync(resources, { recursive: true });
    mkdirSync(source);
    try {
      writeFileSync(join(source, 'main.cjs'), '');
      await asar.createPackage(source, join(resources, 'app.asar'));
      expect(() => assertBrokerExcluded(join(dir, 'KeyShield.app'))).not.toThrow();
      writeFileSync(join(resources, 'approval-mock.cjs'), '');
      expect(() => assertBrokerExcluded(join(dir, 'KeyShield.app'))).toThrow('Dev-only files');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
