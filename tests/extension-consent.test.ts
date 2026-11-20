import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { recognizeValue, PATTERNS } from '../src/extension/lib/recognize.js';
import { PROVIDER_ORIGINS, originPattern, permissionFor, requireProvider } from '../src/extension/lib/policy.js';
import { LocalVault, ITERATIONS, audit } from '../src/extension/lib/vault.js';

const directory = 'tests/fixtures/extension-acceptance/';
const { samples } = JSON.parse(readFileSync(`${directory}keys.json`, 'utf8'));
const patterns = samples.map((sample) => ({ provider: sample.provider, source: sample.regex }));
const origin = 'https://dashboard.provider.test';
const candidate = { ...samples[0], origin, preview: '••••AAAA' };
const passphrase = 'synthetic passphrase only';

function storage() {
  const data: Record<string, any> = {};
  return {
    data,
    async get(key: string) { return structuredClone({ [key]: data[key] }); },
    async set(values: Record<string, any>) { Object.assign(data, structuredClone(values)); },
  };
}

beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });

describe('single-value recognition (synthetic adapter)', () => {
  it('recognizes each complete sample separately, never a page or multiple values', () => {
    for (const sample of samples) {
      expect(recognizeValue(sample.value, patterns)).toEqual({ provider: sample.provider, value: sample.value, preview: `••••${sample.value.slice(-4)}` });
    }
    expect(recognizeValue(samples.map((sample) => sample.value).join('\n'), patterns)).toBeNull();
    expect(recognizeValue(readFileSync(`${directory}code-block.html`, 'utf8'), patterns)).toBeNull();
  });
  it('rejects negatives, empty, masked, oversized and surrounding page text', () => {
    const { negatives } = JSON.parse(readFileSync(`${directory}keys.json`, 'utf8'));
    for (const value of [...negatives.map((sample) => sample.value), '', '••••••••', `${samples[0].value}****`, `key: ${samples[0].value}`, 'x'.repeat(8193), null]) {
      expect(recognizeValue(value, patterns)).toBeNull();
      expect(recognizeValue(value)).toBeNull();
    }
  });
  it('keeps the production patterns separate from the adapter', () => {
    expect(JSON.stringify(PATTERNS)).not.toContain('FAKE');
    for (const sample of samples) expect(recognizeValue(sample.value)).toBeNull();
  });
});

describe('provider policy', () => {
  it('drops non-default ports from permissions but preserves exact-origin policy and binding', async () => {
    const boundOrigin = 'https://localhost:8443';
    const grants: any[] = [];
    const permissions = { async contains(grant) { grants.push(grant); return true; } };
    expect(originPattern(boundOrigin)).toBe('https://localhost/*');
    expect(permissionFor(`${boundOrigin}/keys`, [boundOrigin])).toBe('https://localhost/*');
    await expect(requireProvider(`${boundOrigin}/keys`, permissions, [boundOrigin])).resolves.toBe(boundOrigin);
    expect(grants).toEqual([{ origins: ['https://localhost/*'] }]);
    for (const other of ['https://localhost', 'https://localhost:9443', 'http://localhost:8443']) {
      expect(permissionFor(other, [boundOrigin])).toBeNull();
      await expect(requireProvider(other, permissions, [boundOrigin])).rejects.toThrow('not a supported provider page');
    }
    expect(grants).toHaveLength(1);
  });
  it('requires exact approved HTTPS origins and permission', async () => {
    expect(permissionFor('https://evil.test')).toBeNull();
    expect(permissionFor('https://platform.openai.com.evil.test')).toBeNull();
    expect(permissionFor('http://platform.openai.com')).toBeNull();
    expect(permissionFor('not a URL')).toBeNull();
    expect(permissionFor('https://github.com/other')).toBeNull();
    expect(permissionFor('https://github.com/settings/tokens')).toBe('https://github.com/*');
    await expect(requireProvider(origin, { contains: async () => true })).rejects.toThrow('not a supported provider page');
    await expect(requireProvider(PROVIDER_ORIGINS[0], { contains: async () => false })).rejects.toThrow('not a supported provider page');
    await expect(requireProvider(PROVIDER_ORIGINS[0], { contains: async () => true })).resolves.toBe(PROVIDER_ORIGINS[0]);
  });
});

describe('popup permission consent', () => {
  it.each([
    ['https://github.com/settings/tokens', false],
    ['https://github.com/example/repository', true],
    ['https://github.com/settings-other', true],
  ])('shows policy-aware availability on %s (unavailable=%s)', async (url, unavailable) => {
    const nodes = new Map<string, any>();
    const node = () => ({
      value: '', textContent: '', children: [] as any[],
      replaceChildren(...children) { this.children = children; this.value = children[0]?.value || ''; },
      append(...children) { this.children.push(...children); },
      addEventListener() {},
    });
    const document = {
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, node());
        return nodes.get(id);
      },
      createElement: node,
    };
    const entry = { id: 'github-key', provider: 'github', origin: 'https://github.com', preview: '••••AAAA', label: 'Synthetic GitHub key' };
    const chrome = {
      tabs: { query: async () => [{ url }] },
      runtime: { sendMessage: async ({ type }) => type === 'LIST' ? { ok: true, entries: [entry] } : { ok: false } },
      storage: { onChanged: { addListener() {} } },
    };
    const source = readFileSync('src/extension/popup.js', 'utf8').replace(/^import .*;\n/, '');
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    await new AsyncFunction('originPattern', 'permissionFor', 'document', 'chrome', 'window', 'location', 'Option', source)(
      originPattern, permissionFor, document, chrome, { addEventListener() {} }, { pathname: '/popup.html' },
      function (text, value) { this.textContent = text; this.value = value; },
    );
    const permissions = { contains: async () => true };
    if (unavailable) {
      await expect(requireProvider(url, permissions)).rejects.toThrow('not a supported provider page');
      expect(nodes.get('fill-availability').textContent).toBe('Not available on this site. Fill only on https://github.com');
      expect(nodes.get('entry-list').children[0].children.at(-1).textContent).toBe('Not available on this site');
    } else {
      await expect(requireProvider(url, permissions)).resolves.toBe('https://github.com');
      expect(nodes.get('fill-availability').textContent).toBe('Fill only on https://github.com');
      expect(nodes.get('entry-list').children[0].children).toHaveLength(3);
    }
  });
  const clicks = [['add', '/popup.html'], ['save', '/popup.html'], ['confirm', '/popup.html'], ['fill', '/popup.html'], ['save', '/confirm.html'], ['confirm', '/confirm.html']];
  const cases = clicks.flatMap(([button, pathname]) => [false, true].flatMap((accepted) => ['https://platform.openai.com', 'https://localhost:8443'].map((tabOrigin) => ({ button, pathname, accepted, tabOrigin }))));
  it.each(cases)('$pathname $button at $tabOrigin requests permission synchronously before any other API (accepted=$accepted)', async ({ button, pathname, accepted, tabOrigin }) => {
    const handlers = new Map<string, () => Promise<void>>();
    const nodes = new Map<string, any>();
    const document = { getElementById(id: string) {
      if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', replaceChildren() {}, addEventListener(event, handler) { if (event === 'click') handlers.set(id, handler); } });
      return nodes.get(id);
    } };
    const messages: string[] = [];
    const grants: any[] = [];
    const calls: string[] = [];
    let inGesture = false;
    let allow = true;
    const pending = { id: 'one', preview: '••••AAAA', provider: 'openai', origin: tabOrigin, providers: ['openai'], permissionNeeded: true };
    const chrome = {
      runtime: { async sendMessage(message) {
        calls.push(message.type); messages.push(message.type);
        if (['PENDING', 'ADD'].includes(message.type)) return { ok: true, pending };
        if (message.type === 'SAVE') return { ok: true, duplicate: true };
        return { ok: true, entries: [] };
      } },
      tabs: { async query() { calls.push('query'); return [{ url: pathname === '/confirm.html' ? 'chrome-extension://unit/confirm.html' : `${tabOrigin}/api-keys` }]; } },
      permissions: {
        async contains() { calls.push('contains'); return false; },
        request(grant) {
          if (!inGesture) throw new Error('permissions.request after the user gesture');
          calls.push('request'); grants.push(grant); return Promise.resolve(allow);
        },
      },
      storage: { onChanged: { addListener() {} } },
    };
    const source = readFileSync('src/extension/popup.js', 'utf8').replace(/^import[^\n]+\n/, '');
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    await new AsyncFunction('originPattern', 'permissionFor', 'document', 'chrome', 'window', 'location', 'Option', source)(originPattern, (url) => permissionFor(url, [tabOrigin]), document, chrome, { addEventListener() {} }, { pathname }, function () {});
    expect(grants).toEqual([]);
    expect(messages).toEqual(['PENDING', 'LIST']);
    expect(nodes.get('status').textContent).toBe(`Permission needed for ${tabOrigin}`);
    expect(nodes.get('origin').textContent).toBe(tabOrigin);
    if (button === 'confirm') {
      inGesture = true;
      await handlers.get('save')!();
      expect(nodes.get('confirm').hidden).toBe(false);
    }
    messages.length = 0; calls.length = 0; grants.length = 0;
    allow = accepted;
    inGesture = true;
    queueMicrotask(() => { inGesture = false; });
    const clicked = handlers.get(button)!();
    expect(calls[0]).toBe('request');
    await clicked;
    expect(grants).toEqual([{ origins: [originPattern(tabOrigin)] }]);
    const messageType = button === 'add' ? 'ADD' : button === 'fill' ? 'FILL' : 'SAVE';
    expect(messages.includes(messageType)).toBe(accepted);
    expect(calls).not.toContain('query');
    expect(calls).not.toContain('contains');
    if (!accepted) {
      expect(messages).toEqual([]);
      expect(nodes.get('status').textContent).toBe('not a supported provider page');
    }
  });
});

describe('device local vault', () => {
  it('encrypts empty and populated vaults, roundtrips after lock, and rejects wrong passphrases/tampering', async () => {
    const local = storage();
    const vault = new LocalVault(local);
    await expect(vault.save(candidate, 'test')).rejects.toThrow('Unlock');
    await expect(vault.unlock('')).rejects.toThrow('12 characters');
    await vault.unlock(passphrase);
    expect(vault.list()).toEqual([]);
    await vault.save(candidate, 'Test');
    expect(ITERATIONS).toBeGreaterThanOrEqual(310000);
    expect(local.data.vault.salt).toHaveLength(16);
    expect(local.data.vault.iv).toHaveLength(12);
    expect(JSON.stringify(local.data)).not.toContain(candidate.value);
    vault.lock();
    expect(() => vault.get('absent')).toThrow('Unlock');
    await expect(vault.unlock('wrong synthetic passphrase')).rejects.toThrow('Incorrect');
    await vault.unlock(passphrase);
    expect(vault.get(vault.list()[0].id).value).toBe(candidate.value);
    expect(() => vault.get('absent')).toThrow('not found');
    local.data.vault.ciphertext[0] ^= 1;
    await expect(vault.unlock(passphrase)).rejects.toThrow('damaged');
    vault.lock();
  });
  it('requires duplicate confirmation and updates only label, never bound origin', async () => {
    const local = storage();
    const vault = new LocalVault(local);
    await vault.unlock(passphrase);
    await vault.save(candidate, 'First');
    const before = structuredClone(local.data);
    expect(await vault.save({ ...candidate, origin: 'https://evil.test' }, 'Changed')).toEqual({ duplicate: true });
    expect(local.data).toEqual(before);
    await vault.save({ ...candidate, origin: 'https://evil.test' }, 'Confirmed', true);
    expect(vault.list()).toHaveLength(1);
    expect(vault.list()[0]).toMatchObject({ label: 'Confirmed', origin });
    vault.lock();
  });
  it('decline records only metadata and never creates a vault or queue', async () => {
    const local = storage();
    await audit(local, 'declined', candidate);
    expect(Object.keys(local.data)).toEqual(['auditLog']);
    expect(Object.keys(local.data.auditLog[0]).sort()).toEqual(['action', 'origin', 'provider', 'time']);
    expect(JSON.stringify(local.data)).not.toContain(candidate.value);
    await expect(audit(local, 'invalid', candidate)).rejects.toThrow('Invalid');
  });
  it('idle locks even if a suspended worker missed its timer', async () => {
    let time = 0;
    const vault = new LocalVault(storage(), { now: () => time });
    await vault.unlock(passphrase);
    time = 60001;
    expect(() => vault.list()).toThrow('Unlock');
    expect(vault.aes).toBeNull();
    expect(vault.entries).toBeNull();
  });
  it('fails closed on storage errors without a silent in-memory save', async () => {
    const local = storage();
    const vault = new LocalVault(local);
    await vault.unlock(passphrase);
    local.set = async () => { throw new Error('storage unavailable'); };
    await expect(vault.save(candidate, 'fail')).rejects.toThrow('storage unavailable');
    expect(vault.list()).toEqual([]);
    vault.lock();
  });
});

describe('extension security surface', () => {
  it('offers Fill only in the normal popup, not the selection confirmation window', () => {
    expect(readFileSync('src/extension/confirm.html', 'utf8')).not.toMatch(/id="(?:fill|entries)"/);
    expect(readFileSync('src/extension/popup.html', 'utf8')).toContain('id="fill"');
  });
  it('manifests match shared policy without broad or passive capabilities', () => {
    for (const name of ['manifest.json', 'manifest.firefox.json']) {
      const manifest = JSON.parse(readFileSync(`src/extension/${name}`, 'utf8'));
      expect(manifest.permissions).toEqual(['storage', 'activeTab', 'scripting', 'contextMenus']);
      expect(manifest.optional_host_permissions).toEqual(PROVIDER_ORIGINS.map((host) => `${host}/*`));
      for (const field of ['content_scripts', 'host_permissions', 'externally_connectable']) expect(manifest[field]).toBeUndefined();
      expect(JSON.stringify(manifest)).not.toMatch(/<all_urls>|clipboardRead|\.test/);
    }
  });
  it('has no networking, clipboard reads, passive observers or dashboard messages', () => {
    function sources(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((file) => file.isDirectory() ? (file.name === 'safari-wrapper' ? [] : sources(resolve(dir, file.name))) : /\.(js|html)$/.test(file.name) ? [readFileSync(resolve(dir, file.name), 'utf8')] : []);
    }
    expect(sources('src/extension').join('\n')).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|clipboard|MutationObserver|tabs\.sendMessage|onMessageExternal|\/manage\/|session-bridge|pending.vault|auto_store|detectPage|querySelectorAll|createTreeWalker|innerText|Find keys on this page/);
    const background = readFileSync('src/extension/background.js', 'utf8');
    expect(background.match(/scripting\.executeScript/g)).toHaveLength(1);
    expect(background.indexOf('scripting.executeScript')).toBeGreaterThan(background.indexOf("case 'FILL'"));
  });
});
