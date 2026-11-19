import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { expect, it } from 'vitest';
import { LocalVault, audit } from '../src/extension/lib/vault.js';
import { recognizeValue } from '../src/extension/lib/recognize.js';
import { permissionFor, requireProvider } from '../src/extension/lib/policy.js';

const { samples } = JSON.parse(readFileSync('tests/fixtures/extension-acceptance/keys.json', 'utf8'));
const patterns = samples.map((sample) => ({ provider: sample.provider, source: sample.regex }));
const origin = 'https://dashboard.provider.test';
const passphrase = 'FAKE local passphrase';

async function background({ allowed = true, data = {} as Record<string, any> } = {}) {
  let removed;
  let receive;
  let injections = 0;
  const tab = { id: 1, url: `${origin}/input.html` };
  const chrome = {
    storage: { local: {
      async get(key) { return structuredClone(key === null ? data : { [key]: data[key] }); },
      async set(values) { Object.assign(data, structuredClone(values)); },
      async remove(keys) { for (const key of keys) delete data[key]; },
    } },
    runtime: { id: 'unit', getURL: (path) => `chrome-extension://unit/${path}`,
      onInstalled: { addListener() {} }, onStartup: { addListener() {} },
      onMessage: { addListener(handler) { receive = handler; } } },
    contextMenus: { onClicked: { addListener() {} } },
    windows: { async create() { return { id: 42 }; }, onRemoved: { addListener(handler) { removed = handler; } } },
    tabs: { async query() { return [tab]; }, async get() { return tab; } },
    permissions: { async contains() { return allowed; } },
    scripting: { async executeScript() { injections++; throw new Error('Unexpected injection'); } },
  };
  const source = readFileSync('src/extension/background.js', 'utf8').replace(/^import[^\n]+\n/gm, '');
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const api = await new AsyncFunction('chrome', 'LocalVault', 'audit', 'PROVIDER_ORIGINS', 'permissionFor', 'requireProvider', 'PATTERNS', 'recognizeValue', 'crypto', `${source}\nreturn { handle, handleSelection, menuOptions, state: () => pending, lock: () => vault.lock() };`)(
    chrome, LocalVault, audit, [origin], (url) => permissionFor(url, [origin]), (url, permissions) => requireProvider(url, permissions, [origin]), patterns, (value) => recognizeValue(value, patterns), webcrypto,
  );
  return { ...api, tab, data, grant: () => { allowed = true; }, injections: () => injections, close: () => removed(42), receive: (...args) => receive(...args) };
}

it('selection retains exactly the selected value in memory and returns only masked metadata', async () => {
  const bg = await background();
  await bg.handleSelection({ menuItemId: 'save-selection', selectionText: samples[0].value }, bg.tab);
  const response = await bg.handle({ type: 'PENDING' });
  expect(Object.keys(response.pending).sort()).toEqual(['id', 'origin', 'permissionNeeded', 'preview', 'provider', 'providers']);
  expect(JSON.stringify(response)).not.toContain(samples[0].value);
  expect(bg.state().value).toBe(samples[0].value);
  for (const sample of samples.slice(1)) expect(JSON.stringify(bg.state())).not.toContain(sample.value);
  expect(bg.data).toEqual({});
  expect(bg.injections()).toBe(0);
  expect(bg.menuOptions.contexts).toEqual(['selection']);
  expect(bg.menuOptions.documentUrlPatterns).toEqual([`${origin}/*`]);
  bg.close();
  await expect(bg.handle({ type: 'PENDING' })).rejects.toThrow('No pending value');
});

it('rejects unsupported origins and unrecognized selections without retaining values', async () => {
  const bg = await background();
  expect(await bg.handleSelection({ menuItemId: 'save-selection', selectionText: samples[0].value }, { ...bg.tab, url: 'https://evil.test' })).toMatchObject({ ok: false, error: 'not a supported provider page' });
  expect(bg.state().value).toBeUndefined();
  expect(bg.data).toEqual({});
  expect(bg.injections()).toBe(0);
  bg.close();
  expect(await bg.handleSelection({ menuItemId: 'save-selection', selectionText: '••••••' }, bg.tab)).toMatchObject({ ok: false, error: 'Not a recognised key, nothing saved' });
  expect(bg.state().value).toBeUndefined();
});

it('offers one selection for permission confirmation but refuses Save until the bound origin is granted', async () => {
  const bg = await background({ allowed: false });
  expect(await bg.handleSelection({ menuItemId: 'save-selection', selectionText: samples[0].value }, bg.tab)).toMatchObject({ ok: true });
  const { pending } = await bg.handle({ type: 'PENDING' });
  expect(pending).toMatchObject({ origin, permissionNeeded: true });
  expect(bg.data).toEqual({});
  await bg.handle({ type: 'UNLOCK', passphrase });
  const save = { type: 'SAVE', id: pending.id, provider: pending.provider, label: 'Granted' };
  await expect(bg.handle(save)).rejects.toThrow('not a supported provider page');
  expect((await bg.handle({ type: 'LIST' })).entries).toEqual([]);
  expect(bg.injections()).toBe(0);
  bg.grant();
  await bg.handle(save);
  expect((await bg.handle({ type: 'LIST' })).entries).toHaveLength(1);
  expect(JSON.stringify(bg.data)).not.toContain(samples[0].value);
  bg.lock();
});

it('paste needs separate Save, unlock, valid provider and unchanged bound origin', async () => {
  const bg = await background();
  const { pending } = await bg.handle({ type: 'ADD', value: samples[0].value });
  expect(bg.data).toEqual({});
  const save = { type: 'SAVE', id: pending.id, provider: samples[1].provider, label: 'Confirmed provider' };
  await expect(bg.handle(save)).rejects.toThrow('Unlock');
  await bg.handle({ type: 'UNLOCK', passphrase });
  await expect(bg.handle({ ...save, provider: 'invalid' })).rejects.toThrow('supported provider');
  bg.tab.url = 'https://evil.test';
  await expect(bg.handle(save)).rejects.toThrow('not a supported provider page');
  bg.tab.url = `${origin}/input.html`;
  await bg.handle(save);
  expect((await bg.handle({ type: 'LIST' })).entries).toHaveLength(1);
  expect((await bg.handle({ type: 'LIST' })).entries[0].provider).toBe(samples[1].provider);
  expect(JSON.stringify(bg.data)).not.toContain(samples[0].value);
  await expect(bg.handle(save)).rejects.toThrow('No pending value');
  bg.lock();
});

it('cancel and worker restart lose pending values; stale tokens and external messages fail closed', async () => {
  const bg = await background();
  const first = (await bg.handle({ type: 'ADD', value: samples[0].value })).pending;
  const second = (await bg.handle({ type: 'ADD', value: samples[1].value })).pending;
  await bg.handle({ type: 'CANCEL', id: first.id });
  expect(bg.state().id).toBe(second.id);
  expect(bg.receive({ type: 'ADD', value: samples[0].value }, { id: 'external', url: 'https://evil.test' }, () => {})).toBe(false);
  const restarted = await background({ data: bg.data });
  await expect(restarted.handle({ type: 'PENDING' })).rejects.toThrow('No pending value');
  await bg.handle({ type: 'CANCEL', id: second.id, audit: true });
  await expect(bg.handle({ type: 'CANCEL' })).resolves.toEqual({});
  expect(bg.state()).toBeNull();
  expect(Object.keys(bg.data)).toEqual(['auditLog']);
  expect(Object.keys(bg.data.auditLog[0]).sort()).toEqual(['action', 'origin', 'provider', 'time']);
});
