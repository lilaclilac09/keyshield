import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { renderMasFixtureApp } from '../src/web/mas-fixture/MasFixtureApp';
import { createFixtureSession, FIXTURE_ENTRY, FIXTURE_STORAGE } from '../src/web/mas-fixture/vault';
import { rendererProfilePlugin } from '../src/web/renderer-profile';

let data: Map<string, string>;
let storage: Pick<Storage, 'getItem' | 'setItem'>;
beforeEach(() => {
  data = new Map();
  storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
  vi.stubGlobal('__KEYSHIELD_RENDERER_PROFILE__', 'mas-fixture');
  vi.stubGlobal('window', { keyshieldDesktop: { syntheticOnly: true } });
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => { vi.unstubAllGlobals(); });
async function render() {
  const root = { innerHTML: '', querySelector: () => ({}) };
  await renderMasFixtureApp(root as unknown as HTMLElement);
  return root.innerHTML;
}
async function selected() {
  const vault = createFixtureSession(storage);
  await vault.init(); await vault.unlock(); await vault.save(FIXTURE_ENTRY);
  return vault;
}

describe('MAS fixture profile isolation and public-seed lock mechanics', () => {
  it.each([undefined, false, 'true', 1])('refuses a missing/non-boolean handshake %s', async syntheticOnly => {
    vi.stubGlobal('window', { keyshieldDesktop: { syntheticOnly } });
    const html = await render();
    expect(html).toContain('fixture-refusal'); expect(html).not.toContain('<button');
  });
  it('refuses a non-fixture build even with the handshake', async () => {
    vi.stubGlobal('__KEYSHIELD_RENDERER_PROFILE__', 'standard');
    expect(await render()).toContain('fixture-refusal');
    expect(await render()).not.toContain('fixture-entry');
  });
  it('renders a fresh locked app with exactly one Demo key choice and no credential input, paste handler or network request', async () => {
    const network = vi.fn(() => { throw new Error('Network forbidden'); });
    vi.stubGlobal('fetch', network);
    const html = await render();
    expect(html.match(/data-testid="fixture-entry"/g)).toHaveLength(1);
    expect(html).toContain('>Demo key</button>');
    expect(html).toContain('Fixture vault locked');
    expect(html).toContain('not real protection');
    expect(html).not.toMatch(/<(input|textarea|form)|contenteditable|onpaste|type="file"/i);
    expect(network).not.toHaveBeenCalled(); expect(data.size).toBe(0);
    for (const file of readdirSync('src/web/mas-fixture')) {
      expect(readFileSync('src/web/mas-fixture/' + file, 'utf8')).not.toMatch(/<input|<textarea|contentEditable|onPaste|addEventListener|clipboard|FileReader|\.files\b|fetch\(|XMLHttpRequest|WebSocket|sendBeacon/);
    }
  });
  it('saves versioned ciphertext only and survives lock/unlock and reload without plaintext persistence', async () => {
    const vault = await selected();
    const first = data.get(FIXTURE_STORAGE)!;
    expect(first).not.toContain(FIXTURE_ENTRY.value); expect(first).not.toContain('Demo key');
    expect(Object.keys(JSON.parse(first)).sort()).toEqual(['ciphertext', 'iv', 'locked', 'version']);
    await vault.lock();
    expect(vault.snapshot()).toEqual({ locked: true, entry: null, error: null });
    const locked = data.get(FIXTURE_STORAGE)!;
    expect(locked).not.toBe(first); expect(JSON.parse(locked).locked).toBe(true);
    const reopened = createFixtureSession(storage); await reopened.init();
    expect(data.get(FIXTURE_STORAGE)).toBe(locked);
    expect(reopened.snapshot().entry).toBeNull();
    await reopened.unlock(); expect(reopened.snapshot().entry).toEqual(FIXTURE_ENTRY);
    const reloaded = createFixtureSession(storage); await reloaded.init();
    expect(reloaded.snapshot()).toEqual({ locked: false, entry: FIXTURE_ENTRY, error: null });
    await reloaded.lock(); await reloaded.unlock(); expect(reloaded.snapshot().entry).toEqual(FIXTURE_ENTRY);
  });
  it.each(['ciphertext', 'iv', 'locked', 'version', 'malformed'])('rejects tampered/unknown %s without overwriting or rendering an entry', async field => {
    await selected();
    const envelope = JSON.parse(data.get(FIXTURE_STORAGE)!);
    if (field === 'ciphertext' || field === 'iv') envelope[field] = 'AAAA';
    else if (field === 'locked') envelope.locked = !envelope.locked;
    else envelope.version = 99;
    const invalid = field === 'malformed' ? '{broken' : JSON.stringify(envelope);
    data.set(FIXTURE_STORAGE, invalid);
    const html = await render();
    expect(html).toContain('Fixture data rejected'); expect(html).not.toContain('fixture-entry');
    expect(data.get(FIXTURE_STORAGE)).toBe(invalid);
  });
  it.each([{ label: 'other', value: FIXTURE_ENTRY.value }, { ...FIXTURE_ENTRY, value: 'not-the-fixture' }, { ...FIXTURE_ENTRY, extra: true }, null])('rejects every non-exact save/import pair', async entry => {
    const vault = await selected(); const before = data.get(FIXTURE_STORAGE);
    await vault.save(entry);
    expect(vault.snapshot().entry).toBeNull(); expect(vault.snapshot().error).toContain('rejected');
    expect(data.get(FIXTURE_STORAGE)).toBe(before);
  });
  it('fails closed if persistence is unavailable', async () => {
    storage.setItem = () => { throw new Error('Unavailable'); };
    const vault = createFixtureSession(storage); await vault.unlock();
    expect(vault.snapshot().locked).toBe(true); expect(vault.snapshot().error).toContain('rejected');
  });
  it('rejects decryptable ciphertext containing a non-exact entry', async () => {
    const encode = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', encode.encode('KeyShield MAS fixture public lock mechanics seed v1'), 'HKDF', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encode.encode(FIXTURE_STORAGE), info: encode.encode('public fixture AES-GCM') }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = new Uint8Array(12);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encode.encode(FIXTURE_STORAGE + ':false') }, key, encode.encode(JSON.stringify({ entry: { ...FIXTURE_ENTRY, label: 'Other key' } })));
    const invalid = JSON.stringify({ version: 1, locked: false, iv: btoa(String.fromCharCode(...iv)), ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))) });
    data.set(FIXTURE_STORAGE, invalid);
    const html = await render();
    expect(html).toContain('Fixture data rejected'); expect(html).not.toContain('fixture-entry');
    expect(data.get(FIXTURE_STORAGE)).toBe(invalid);
  });
  it.each(['standard', 'mas-fixture'])('emits the %s marker and baked define', profile => {
    const plugin = rendererProfilePlugin(profile), emitFile = vi.fn();
    (plugin.generateBundle as Function).call({ emitFile });
    const marker = JSON.parse(emitFile.mock.calls[0][0].source);
    expect(marker.profile).toBe(profile); expect(marker.commit).toMatch(/^[0-9a-f]{40}$/);
    expect((plugin.config as Function)().define.__KEYSHIELD_RENDERER_PROFILE__).toBe(JSON.stringify(profile));
  });
  it('rejects unknown build profiles', () => { expect(() => rendererProfilePlugin('other')).toThrow('Unknown renderer profile'); });
});
