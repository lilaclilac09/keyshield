import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectPage, PATTERNS, pairAWS } from '../src/extension/lib/detect.js';
import { PROVIDER_ORIGINS, permissionFor, requireProvider } from '../src/extension/lib/policy.js';
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

function rootFor(html: string) {
  const nodes = [...html.matchAll(/<(input|code|pre|output)\b([^>]*)>([\s\S]*?)<\/\1>|<input\b([^>]*)>/g)].map((match) => {
    const attrs = match[2] || match[4] || '';
    return {
      tagName: (match[1] || 'input').toUpperCase(),
      type: attrs.match(/type="([^"]+)"/)?.[1] || 'text',
      value: attrs.match(/value="([^"]*)"/)?.[1] || '',
      innerText: (match[3] || '').replace(/<[^>]+>/g, ''),
      parentElement: null,
      hidden: attrs.includes('hidden'),
      getClientRects: () => [1],
    };
  });
  return {
    location: { origin }, querySelectorAll: () => nodes,
    defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) },
    createTreeWalker(el) {
      let visited = false;
      return { nextNode() { if (visited) return null; visited = true; return { parentElement: el, textContent: el.innerText }; } };
    },
  };
}

beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });

describe('consent detector (synthetic adapter)', () => {
  it('detects all nine complete FAKE samples in code blocks and returns only candidates', () => {
    const hits = detectPage(patterns, origin, rootFor(readFileSync(`${directory}code-block.html`, 'utf8')));
    expect(hits.map((hit) => hit.value).sort()).toEqual(samples.map((sample) => sample.value).sort());
    expect(Object.keys(hits[0]).sort()).toEqual(['preview', 'provider', 'value']);
    expect(hits.every((hit) => !hit.preview.includes('FAKE'))).toBe(true);
    expect(pairAWS(hits).find((hit) => hit.provider === 'aws')?.value).toContain(samples[5].value);
  });
  it.each(['negative', 'empty', 'reveal'])('%s does not reveal a candidate', (name) => {
    expect(detectPage(patterns, origin, rootFor(readFileSync(`${directory}${name}.html`, 'utf8')))).toEqual([]);
  });
  it('reads inputs and environment snippets', () => {
    for (const [name, count] of [['input', 1], ['env', 3]] as const) {
      expect(detectPage(patterns, origin, rootFor(readFileSync(`${directory}${name}.html`, 'utf8')))).toHaveLength(count);
    }
  });
  it('ignores masked, password, hidden and wrong-origin values', () => {
    const value = samples[0].value;
    for (const html of [`<input value="${value}****">`, `<input type="password" value="${value}">`, `<input hidden value="${value}">`]) {
      expect(detectPage(patterns, origin, rootFor(html))).toEqual([]);
    }
    expect(detectPage(patterns, 'https://evil.test', rootFor(`<output>${value}</output>`))).toEqual([]);
  });
  it('keeps the production patterns separate from the adapter', () => {
    expect(JSON.stringify(PATTERNS)).not.toContain('FAKE');
    expect(pairAWS([])).toEqual([]);
  });
});

describe('provider policy', () => {
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
  it.each([false, true])('requests a missing optional permission only on Find (accepted=%s)', async (accepted) => {
    const handlers = new Map<string, () => Promise<void>>();
    const nodes = new Map<string, any>();
    const document = { getElementById(id: string) {
      if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', replaceChildren() {}, addEventListener(event, handler) { if (event === 'click') handlers.set(id, handler); } });
      return nodes.get(id);
    } };
    const messages: string[] = [];
    const grants: any[] = [];
    const chrome = {
      runtime: { async sendMessage(message) { messages.push(message.type); return message.type === 'FIND' ? { ok: true, candidates: [] } : { ok: false }; } },
      tabs: { async query() { return [{ url: 'https://platform.openai.com/api-keys' }]; } },
      permissions: { async contains() { return false; }, async request(grant) { grants.push(grant); return accepted; } },
      storage: { onChanged: { addListener() {} } },
    };
    const source = readFileSync('src/extension/popup.js', 'utf8').replace(/^import[^\n]+\n/, '');
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    await new AsyncFunction('permissionFor', 'document', 'chrome', 'window', source)(permissionFor, document, chrome, { addEventListener() {} });
    expect(grants).toEqual([]);
    expect(messages).toEqual(['LIST']);
    await handlers.get('find')!();
    expect(grants).toEqual([{ origins: ['https://platform.openai.com/*'] }]);
    expect(messages.includes('FIND')).toBe(accepted);
    expect(nodes.get('status').textContent).toBe(accepted ? 'No visible keys found' : 'not a supported provider page');
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
  it('manifests match shared policy without broad or passive capabilities', () => {
    for (const name of ['manifest.json', 'manifest.firefox.json']) {
      const manifest = JSON.parse(readFileSync(`src/extension/${name}`, 'utf8'));
      expect(manifest.permissions).toEqual(['storage', 'activeTab', 'scripting']);
      expect(manifest.optional_host_permissions).toEqual(PROVIDER_ORIGINS.map((host) => `${host}/*`));
      for (const field of ['content_scripts', 'host_permissions', 'externally_connectable']) expect(manifest[field]).toBeUndefined();
      expect(JSON.stringify(manifest)).not.toMatch(/<all_urls>|clipboardRead|\.test/);
    }
  });
  it('has no networking, clipboard reads, passive observers or dashboard messages', () => {
    function sources(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((file) => file.isDirectory() ? (file.name === 'safari-wrapper' ? [] : sources(resolve(dir, file.name))) : /\.(js|html)$/.test(file.name) ? [readFileSync(resolve(dir, file.name), 'utf8')] : []);
    }
    expect(sources('src/extension').join('\n')).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|clipboard|MutationObserver|tabs\.sendMessage|onMessageExternal|\/manage\/|session-bridge|pending.vault|auto_store/);
  });
});
