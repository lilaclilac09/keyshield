import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { syntheticOnly, bundledRequest, createBetaBoundary } = require('../src/desktop/beta-policy.cjs');
const dirs: string[] = [];
function directory() { const dir = mkdtempSync(join(tmpdir(), 'ks-beta-')); dirs.push(dir); return dir; }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe('baked synthetic beta boundary', () => {
  it('has no env override and fails closed even with an invalid or false policy', () => {
    vi.stubEnv('KS_SYNTHETIC_ONLY', '0');
    vi.stubEnv('KS_DESKTOP_LIVE', '1');
    const resourcesPath = directory();
    expect(syntheticOnly({ mas: true, resourcesPath })).toBe(true);
    expect(syntheticOnly({ mas: false, resourcesPath })).toBe(false);
    writeFileSync(join(resourcesPath, 'beta-policy.json'), '{"syntheticOnly":false}');
    expect(syntheticOnly({ mas: false, resourcesPath })).toBe(true);
    writeFileSync(join(resourcesPath, 'beta-policy.json'), 'malformed');
    expect(syntheticOnly({ mas: false, resourcesPath })).toBe(true);
  });

  it('allows only reads at the exact bundled HTTPS origin', () => {
    expect(bundledRequest('https://app.ks.aileena.xyz/assets/index.js')).toBe(true);
    for (const url of ['https://app.ks.aileena.xyz.evil.test/', 'https://app.ks.aileena.xyz:444/', 'https://user:pass@app.ks.aileena.xyz/', 'http://app.ks.aileena.xyz/', 'wss://app.ks.aileena.xyz/', 'https://sync.ks.aileena.xyz/vault/test', 'https://keyshield-production.up.railway.app/auth/signup', 'https://api.openai.com/', 'https://api.mainnet-beta.solana.com/', 'https://checkout.stripe.com/', 'bad']) {
      expect(bundledRequest(url)).toBe(false);
    }
    expect(bundledRequest('https://app.ks.aileena.xyz/vault/test', 'PUT')).toBe(false);
  });

  it('cancels default, persistent and later session traffic without logging secrets', async () => {
    const log = vi.fn();
    const boundary = createBetaBoundary({ rendererRoot: directory, log });
    for (let i = 0; i < 3; i++) {
      let listener: any;
      const handlers = new Map();
      const ses = { webRequest: { onBeforeRequest: vi.fn((_filter, cb) => { listener = cb; }) }, protocol: { handle: vi.fn((scheme, cb) => handlers.set(scheme, cb)) } };
      boundary.installSession(ses);
      boundary.installSession(ses);
      expect(ses.webRequest.onBeforeRequest).toHaveBeenCalledTimes(1);
      const callback = vi.fn();
      listener({ url: 'wss://sync.ks.aileena.xyz/path?secret=NEVER_LOG', method: 'GET' }, callback);
      expect(callback).toHaveBeenLastCalledWith({ cancel: true });
      listener({ url: 'https://app.ks.aileena.xyz/', method: 'GET' }, callback);
      expect(callback).toHaveBeenLastCalledWith({ cancel: false });
      const response = await handlers.get('https')({ url: 'https://api.openai.com/path?secret=NEVER_LOG', method: 'POST' });
      expect(response.status).toBe(403);
    }
    expect(JSON.stringify(log.mock.calls)).not.toContain('NEVER_LOG');
    expect(log).toHaveBeenCalledWith('host sync.ks.aileena.xyz blocked');
  });

  it('serves only bundled bytes and never delegates main net/fetch to the network', async () => {
    const root = directory();
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<div id="root">bundled</div>');
    writeFileSync(join(root, 'assets', 'index.js'), 'bundled-script');
    const net = { fetch: vi.fn(), request: vi.fn() };
    const globals = { fetch: vi.fn() };
    createBetaBoundary({ rendererRoot: () => root, log: vi.fn() }).installMainNetwork(net, globals);
    expect(await (await net.fetch('https://app.ks.aileena.xyz/assets/index.js', { bypassCustomProtocolHandlers: true })).text()).toBe('bundled-script');
    await expect(globals.fetch('https://keyshield-production.up.railway.app/health')).rejects.toThrow('blocked');
    await expect(net.fetch('https://app.ks.aileena.xyz/vault/test', { method: 'PUT', body: 'FAKE_KEYSHIELD_NOT_A_KEY::demo' })).rejects.toThrow('blocked');
    expect(() => net.request('https://api.openai.com/')).toThrow('blocked');
    expect((await net.fetch('https://app.ks.aileena.xyz/assets/missing.js')).status).toBe(404);
  });

  it('wires every session, disables browser escape routes and exposes the immutable preload flag', () => {
    const main = readFileSync(resolve(__dirname, '../src/desktop/main.cjs'), 'utf8');
    expect(main).toContain("app.on('session-created'");
    expect(main).toContain('betaBoundary.installSession(session.defaultSession)');
    expect(main).toContain('betaBoundary.installMainNetwork(net)');
    expect(main).toContain('shell.openExternal = async');
    expect(main).toContain("win.webContents.on('will-navigate'");
    expect(main).toContain("win.webContents.on('will-redirect'");
    expect(main).toContain("if (betaBoundary) { betaBoundary.blocked(url); return { action: 'deny' }; }");
    expect(main).toContain("additionalArguments: SYNTHETIC_ONLY ? ['--ks-synthetic-only'] : []");
  });
});
