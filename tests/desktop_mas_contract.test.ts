import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { verifyMasRendererProfile } = require('../src/desktop/scripts/mas-renderer-contract.cjs');
const commit = 'a'.repeat(40);
const dirs: string[] = [];
function fixture(marker: unknown = { profile: 'mas-fixture', commit }) {
  const root = mkdtempSync(join(tmpdir(), 'ks-mas-profile-'));
  dirs.push(root);
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<div id="root">Demo key</div>');
  writeFileSync(join(root, 'assets', 'fixture.js'), 'const key="FAKE_KEYSHIELD_NOT_A_KEY::demo";');
  if (marker !== null) writeFileSync(join(root, 'renderer-profile.json'), JSON.stringify(marker));
  return root;
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('MAS fixture renderer contract', () => {
  it('accepts a pinned fixture profile and records the exact manifest hash', () => {
    const root = fixture();
    expect(verifyMasRendererProfile(root, commit)).toEqual({ profile: 'mas-fixture', commit, manifestSha256: createHash('sha256').update(readFileSync(join(root, 'renderer-profile.json'))).digest('hex') });
  });

  it('rejects absent, malformed, standard, wrong-commit and invalid profiles', () => {
    for (const marker of [null, {}, false, { profile: 'standard', commit }, { profile: 'mas-fixture', commit: 'b'.repeat(40) }]) {
      expect(() => verifyMasRendererProfile(fixture(marker), commit)).toThrow(/MAS renderer/);
    }
    const root = fixture();
    expect(() => verifyMasRendererProfile(root, '')).toThrow(/profile\/commit/);
    writeFileSync(join(root, 'renderer-profile.json'), '{');
    expect(() => verifyMasRendererProfile(root, commit)).toThrow(/valid renderer-profile/);
  });

  it.each(['keyshield-production.up.railway.app', 'sync.ks.aileena.xyz', 'app.ks.aileena.xyz', 'accounts.google.com', 'unpkg.com', 'fonts.googleapis.com', 'ACCOUNTS.GOOGLE.COM', 'window.keyshieldDesktop?.broker', 'beginApproval', 'pinApprovalPasskey', 'invalidateApprovals', 'approvalStatus', 'approveRequestWithPasskey', 'ks-approval'])('rejects forbidden content %s in nested output', (content) => {
    const root = fixture();
    mkdirSync(join(root, 'assets', 'nested'));
    writeFileSync(join(root, 'assets', 'nested', 'chunk.js.map'), content);
    expect(() => verifyMasRendererProfile(root, commit)).toThrow(/forbidden host\/bridge content: assets/);
  });

  it('rejects symlinks rather than scanning outside the dist closure', () => {
    const root = fixture();
    symlinkSync(join(root, 'index.html'), join(root, 'assets', 'link.html'));
    expect(() => verifyMasRendererProfile(root, commit)).toThrow(/non-regular asset/);
  });

  it('keeps the preload synthetic flag read-only and ignores env opt-outs', () => {
    const source = readFileSync(resolve(__dirname, '../src/desktop/preload.cjs'), 'utf8');
    for (const [mas, argv, expected] of [[true, [], true], [false, ['--ks-synthetic-only'], true], [false, [], false]] as const) {
      let bridge: any;
      runInNewContext(source, {
        require: () => ({ contextBridge: { exposeInMainWorld: (_name: string, value: unknown) => { bridge = value; } }, ipcRenderer: {} }),
        process: { mas, argv, platform: 'darwin', env: { KS_SYNTHETIC_ONLY: '0', KS_DESKTOP_LIVE: '1' } },
      });
      expect(bridge.syntheticOnly).toBe(expected);
      expect(Object.isFrozen(bridge)).toBe(true);
      expect(Reflect.set(bridge, 'syntheticOnly', !expected)).toBe(false);
      expect(bridge.syntheticOnly).toBe(expected);
      expect(bridge.broker).toBeUndefined();
    }
  });

  it('selects the profile only for MAS and validates before packaging and after copying', () => {
    const mas = readFileSync(resolve(__dirname, '../src/desktop/scripts/pack-mas.cjs'), 'utf8');
    const mac = readFileSync(resolve(__dirname, '../src/desktop/scripts/pack-mac.cjs'), 'utf8');
    expect(mas).toContain("prepareMacBuild({ VITE_KEYSHIELD_RENDERER_PROFILE: 'mas-fixture' })");
    expect(mas.indexOf('sources.renderer.profile = verifyMasRendererProfile')).toBeLessThan(mas.indexOf("require('@electron/packager')"));
    expect(mas).toContain('bundledProfile.manifestSha256 !== sources.renderer.profile.manifestSha256');
    expect(mas).toContain('renderer profile manifest sha256:');
    expect(mac).toContain('function prepareMacBuild(rendererEnv = {})');
    expect(mac).toContain('const { sources, rendererReport, icon } = prepareMacBuild();');
    expect(mac).not.toContain("VITE_KEYSHIELD_RENDERER_PROFILE: 'mas-fixture'");
  });
});
