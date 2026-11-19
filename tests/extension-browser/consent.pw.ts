import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:https';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const fixtures = resolve(root, 'tests/fixtures/extension-acceptance');
const { samples, negatives } = JSON.parse(readFileSync(resolve(fixtures, 'keys.json'), 'utf8'));
const origin = 'https://dashboard.provider.test';
const passphrase = 'synthetic local passphrase';
let server: Server;
let requests: { method: string; url: string; body: string }[] = [];
let build: string;
let grantedBuild: string;
let context: BrowserContext;
let worker: Worker;
let page: Page;
let popup: Page;
let tabId: number;
let port: number;

test.beforeAll(async () => {
  const output = resolve(root, 'dist/extension-acceptance');
  mkdirSync(output, { recursive: true });
  build = resolve(output, 'extension');
  execFileSync('node', ['src/extension/build.mjs', build], { cwd: root });
  const policy = resolve(build, 'lib/policy.js');
  writeFileSync(policy, readFileSync(policy, 'utf8').replace('Object.freeze([', "Object.freeze(['https://dashboard.provider.test',"));
  const recognizer = resolve(build, 'lib/recognize.js');
  writeFileSync(recognizer, readFileSync(recognizer, 'utf8').replace(/export const PATTERNS = Object.freeze\([\s\S]*?\n\]\);/, `export const PATTERNS = Object.freeze(${JSON.stringify(samples.map((sample) => ({ provider: sample.provider, source: sample.regex })))});`));
  const background = resolve(build, 'background.js');
  writeFileSync(background, `${readFileSync(background, 'utf8')}\nglobalThis.__test = { select: handleSelection, state: () => ({ pending, entries: vault.entries, menuOptions }) };\n`);
  const manifestPath = resolve(build, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.optional_host_permissions.push(`${origin}/*`);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  grantedBuild = resolve(output, 'extension-granted');
  rmSync(grantedBuild, { recursive: true, force: true });
  cpSync(build, grantedBuild, { recursive: true });
  writeFileSync(resolve(grantedBuild, 'manifest.json'), JSON.stringify({ ...manifest, host_permissions: [`${origin}/*`] }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', resolve(output, 'key.pem'), '-out', resolve(output, 'cert.pem'), '-subj', '/CN=dashboard.provider.test'], { stdio: 'ignore' });
  server = createServer({ key: readFileSync(resolve(output, 'key.pem')), cert: readFileSync(resolve(output, 'cert.pem')) }, (req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method!, url: req.url!, body });
      const name = (req.url || '/').slice(1).split('?')[0];
      if (!['input.html', 'code-block.html', 'env.html', 'reveal.html', 'negative.html', 'empty.html'].includes(name)) { res.writeHead(204); res.end(); return; }
      res.setHeader('Content-Type', 'text/html');
      res.end(readFileSync(resolve(fixtures, name)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTPS listener');
  port = address.port;
});
test.afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
test.beforeEach(async ({}, info) => {
  const profile = mkdtempSync(resolve(root, 'dist/extension-acceptance/profile-'));
  const extension = info.title.startsWith('KS-EXT-004') ? build : grantedBuild;
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, ignoreHTTPSErrors: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-proxy-server', '--ignore-certificate-errors', `--host-resolver-rules=MAP dashboard.provider.test 127.0.0.1:${port}, MAP evil.test 127.0.0.1:${port}`],
  });
  await context.route(/^https?:\/\//, (route) => ['dashboard.provider.test', 'evil.test'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  page = context.pages()[0];
  await page.goto(`${origin}/input.html`);
  tabId = await worker.evaluate(async () => (await chrome.tabs.query({}))[0].id);
  requests = [];
});
test.afterEach(async ({}, info) => {
  expect(requests.filter((req) => req.method !== 'GET')).toEqual([]);
  expect(JSON.stringify(requests)).not.toContain('FAKE_KEYSHIELD');
  console.log(`${info.title}: mock requests=${requests.length}, non-GET=0, transmitted secrets=0`);
  if (popup && !popup.isClosed()) await popup.screenshot({ path: resolve(root, `dist/extension-acceptance/${info.title.split(' ')[0]}.png`), fullPage: true });
  await context?.close();
});
async function openPopup() {
  await page.bringToFront();
  const opened = context.waitForEvent('page');
  await worker.evaluate(() => chrome.windows.create({ url: chrome.runtime.getURL('popup.html'), type: 'popup', focused: false, width: 410, height: 1000 }));
  popup = await opened;
  await popup.waitForLoadState();
  return popup;
}
async function unlock() {
  await popup.locator('#passphrase').fill(passphrase);
  await popup.locator('#unlock').click();
  await expect(popup.locator('#status')).toHaveText('Vault unlocked on this device');
}
async function add(value = samples[0].value) {
  await popup.locator('#key-value').fill(value);
  await popup.locator('#add').click();
  await expect(popup.locator('#status')).toContainText('Confirm provider');
}
async function save() {
  await popup.locator('#save').click();
  await expect(popup.locator('#status')).toContainText('Saved encrypted');
}
async function stored() { return worker.evaluate(() => chrome.storage.local.get(null)); }
async function state() { return worker.evaluate(() => (globalThis as any).__test.state()); }
async function selection(selector: string, value?: string) {
  const selected = await page.locator(selector).evaluate((el, value) => {
    if (el instanceof HTMLInputElement) { el.focus(); el.select(); return el.value.substring(el.selectionStart!, el.selectionEnd!); }
    const node = el.firstChild!;
    const text = node.textContent!;
    const start = value ? text.indexOf(value) : 0;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, value ? start + value.length : text.length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    return window.getSelection()!.toString();
  }, value);
  const opened = context.waitForEvent('page');
  // Test-only hook invokes the exact native-menu handler with a real selection.
  const response = await worker.evaluate(({ selected, tabId, url }) => (globalThis as any).__test.select({ menuItemId: 'save-selection', selectionText: selected }, { id: tabId, url }), { selected, tabId, url: page.url() });
  popup = await opened;
  await popup.waitForLoadState();
  return response;
}

test('KS-EXT-001 selection of one value offers confirm; other page values never read', async () => {
  await page.goto(`${origin}/code-block.html`);
  expect(await stored()).toEqual({});
  await selection('code >> nth=0');
  await expect(popup.locator('#preview')).toHaveText('••••AAAA');
  expect((await state()).pending.value).toBe(samples[0].value);
  expect(await stored()).toEqual({});
  await unlock();
  await save();
  const extensionState = JSON.stringify({ state: await state(), storage: await stored(), ui: await popup.content() });
  for (const sample of samples.slice(1)) expect(extensionState).not.toContain(sample.value);
  expect((await state()).entries.map((entry) => entry.value)).toEqual([samples[0].value]);
});
test('KS-EXT-002 explicit save from input and env selection; unlocked vault required', async () => {
  await selection('input');
  await popup.locator('#save').click();
  await expect(popup.locator('#status')).toContainText('Unlock the vault first');
  expect(await stored()).toEqual({});
  await unlock();
  await save();
  await popup.close();
  await page.goto(`${origin}/env.html`);
  await selection('pre', samples[5].value);
  await save();
  expect((await state()).entries.map((entry) => entry.value)).toEqual([samples[0].value, samples[5].value]);
  expect(JSON.stringify(await stored())).not.toContain('FAKE_KEYSHIELD');
});
test('KS-EXT-003 masked selection rejected; revealed value accepted', async () => {
  await page.goto(`${origin}/reveal.html`);
  await selection('#key');
  await expect(popup.locator('#status')).toHaveText('Not a recognised key, nothing saved');
  expect((await state()).pending.value).toBeUndefined();
  await popup.close();
  await page.locator('#reveal').click();
  expect(await stored()).toEqual({});
  await selection('#key');
  await expect(popup.locator('#provider')).toHaveValue('anthropic');
  expect((await state()).pending.value).toBe(samples[1].value);
});
test('KS-EXT-004 evil origin and missing permission are refused; menu is origin scoped', async () => {
  expect((await state()).menuOptions.documentUrlPatterns).not.toContain('https://evil.test/*');
  expect(await selection('input')).toMatchObject({ ok: false, error: 'not a supported provider page' });
  await expect(popup.locator('#confirmation')).toBeHidden();
  await popup.close();
  await page.goto('https://evil.test/input.html');
  expect(await selection('input')).toMatchObject({ ok: false, error: 'not a supported provider page' });
  expect(await stored()).toEqual({});
  expect((await state()).pending.value).toBeUndefined();
});
test('KS-EXT-005 cancel and close discard the single pending value', async () => {
  await selection('input');
  await popup.locator('#cancel').click();
  await expect(popup.locator('#status')).toContainText('nothing saved');
  expect((await state()).pending).toBeNull();
  expect(Object.keys(await stored())).toEqual(['auditLog']);
  await popup.close();
  await selection('input');
  await popup.close();
  await expect.poll(async () => (await state()).pending).toBeNull();
  expect(Object.keys(await stored())).toEqual(['auditLog']);
  await openPopup();
  await add();
  await popup.close();
  await expect.poll(async () => (await state()).pending).toBeNull();
});
test('KS-EXT-006 paste requires duplicate confirmation; manual and idle locks fail closed', async () => {
  await openPopup();
  await unlock();
  await add();
  await popup.locator('#label').fill('First');
  await save();
  const before = (await stored()).vault;
  await add();
  await popup.locator('#label').fill('Updated');
  await popup.locator('#save').click();
  await expect(popup.locator('#confirm')).toBeVisible();
  expect((await stored()).vault).toEqual(before);
  await popup.locator('#confirm').click();
  await expect(popup.locator('#entries option')).toHaveCount(1);
  await expect(popup.locator('#entries')).toContainText('Updated');
  await popup.locator('#lock').click();
  await popup.locator('#fill').click();
  await expect(popup.locator('#status')).toContainText('Unlock');
  await popup.locator('#passphrase').fill('wrong local passphrase');
  await popup.locator('#unlock').click();
  await expect(popup.locator('#status')).toContainText('Incorrect');
  await unlock();
  await popup.locator('#idle').fill('1');
  await popup.locator('#set-idle').click();
  await expect.poll(async () => (await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'LIST' }))).ok, { intervals: [1500] }).toBe(false);
});
test('KS-EXT-007 hashes, UUIDs, placeholders, identifiers, public base58 and multiple values rejected', async () => {
  await page.goto(`${origin}/negative.html`);
  for (let index = 0; index < negatives.length; index++) {
    await selection(`pre >> nth=${index}`);
    await expect(popup.locator('#status')).toHaveText('Not a recognised key, nothing saved');
    await popup.close();
  }
  await openPopup();
  for (const value of ['', '••••••', samples[0].value + '\n' + samples[1].value]) {
    await popup.locator('#key-value').fill(value);
    await popup.locator('#add').click();
    await expect(popup.locator('#status')).toHaveText('Not a recognised key, nothing saved');
  }
  expect(await stored()).toEqual({});
});
test('KS-USE-001 fill only the focused input on the saved origin; evil gets nothing', async () => {
  await openPopup();
  await unlock();
  await add();
  await save();
  await popup.close();
  await page.locator('input').fill('');
  await page.locator('input').focus();
  await openPopup();
  await popup.locator('#fill').click();
  await expect(popup.locator('#status')).toContainText('Filled focused input');
  await expect(page.locator('input')).toHaveValue(samples[0].value);
  await popup.close();
  await page.goto('https://evil.test/input.html');
  await page.locator('input').fill('');
  await page.locator('input').focus();
  await openPopup();
  await popup.locator('#fill').click();
  await expect(popup.locator('#status')).toContainText('not a supported provider page');
  await expect(page.locator('input')).toHaveValue('');
  expect((await stored()).auditLog.map((entry) => entry.action)).toEqual(['saved', 'filled']);
});
