import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:https';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const fixtures = resolve(root, 'tests/fixtures/extension-acceptance');
const { samples } = JSON.parse(readFileSync(resolve(fixtures, 'keys.json'), 'utf8'));
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

test.beforeAll(async () => {
  const output = resolve(root, 'dist/extension-acceptance');
  mkdirSync(output, { recursive: true });
  build = resolve(output, 'extension');
  execFileSync('node', ['src/extension/build.mjs', build], { cwd: root });
  // The synthetic adapter exists only in this generated test build.
  const policy = resolve(build, 'lib/policy.js');
  writeFileSync(policy, readFileSync(policy, 'utf8').replace("Object.freeze([", "Object.freeze(['https://dashboard.provider.test',"));
  const detector = resolve(build, 'lib/detect.js');
  writeFileSync(detector, readFileSync(detector, 'utf8').replace(/export const PATTERNS = Object.freeze\([\s\S]*?\n\]\);/, `export const PATTERNS = Object.freeze(${JSON.stringify(samples.map((sample) => ({ provider: sample.provider, source: sample.regex })))});`));
  const manifestPath = resolve(build, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.optional_host_permissions.push(`${origin}/*`);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  grantedBuild = resolve(output, 'extension-granted');
  cpSync(build, grantedBuild, { recursive: true });
  // Seed a browser-managed host grant only in the synthetic test build.
  // Native optional-permission prompts are not exposed to Playwright.
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
  await new Promise<void>((resolve) => server.listen(8443, '127.0.0.1', resolve));
});

test.afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

test.beforeEach(async ({}, info) => {
  const profile = mkdtempSync(resolve(root, 'dist/extension-acceptance/profile-'));
  const extension = info.title.startsWith('KS-EXT-004') ? build : grantedBuild;
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, ignoreHTTPSErrors: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-proxy-server', '--ignore-certificate-errors', '--host-resolver-rules=MAP dashboard.provider.test 127.0.0.1:8443, MAP evil.test 127.0.0.1:8443'],
  });
  await context.route(/^https?:\/\//, (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['dashboard.provider.test', 'evil.test'].includes(host) ? route.continue() : route.abort();
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  page = context.pages()[0];
  await page.goto(`${origin}/input.html`);
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
  // Render the real popup in a separate, unfocused extension window. Toolbar
  // action popups are not exposed as Page targets by Chromium's CDP transport.
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

async function find() {
  await popup.locator('#find').click();
  await expect(popup.locator('#status')).toContainText('Select a candidate');
}

async function save() {
  await popup.locator('#save').click();
  await expect(popup.locator('#status')).toContainText('Saved encrypted');
}

async function stored() { return worker.evaluate(() => chrome.storage.local.get(null)); }

test('KS-EXT-001 explicit find returns masked candidates; no passive capture or transmission', async () => {
  await page.goto(`${origin}/code-block.html`);
  await expect.poll(async () => Object.keys(await stored())).toEqual([]);
  await openPopup();
  await find();
  await expect(popup.locator('#candidate option')).toHaveCount(8); // AWS components offered as one pair.
  expect(await popup.locator('#candidate').textContent()).not.toContain('FAKE_KEYSHIELD');
  expect(await stored()).toEqual({});
});

test('KS-EXT-002 explicit Save requires an unlocked local vault and persists only ciphertext', async () => {
  await openPopup();
  await find();
  await popup.locator('#save').click();
  await expect(popup.locator('#status')).toContainText('Unlock the vault first');
  expect(await stored()).toEqual({});
  await unlock();
  const baseline = requests.length;
  await save();
  expect(JSON.stringify(await stored())).not.toContain(samples[0].value);
  expect((await stored()).auditLog[0].action).toBe('saved');
  expect(requests).toHaveLength(baseline);
});

test('KS-EXT-003 decline and close discard candidates without a vault or queue', async () => {
  await openPopup();
  await find();
  await popup.locator('#decline').click();
  await expect(popup.locator('#status')).toContainText('nothing saved');
  expect(Object.keys(await stored())).toEqual(['auditLog']);
  await find();
  await popup.close();
  expect(Object.keys(await stored())).toEqual(['auditLog']);
});

test('KS-EXT-004 unsupported origin and missing permission refuse injection', async () => {
  await openPopup();
  const denied = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'FIND' }));
  expect(denied).toMatchObject({ ok: false, error: 'not a supported provider page' });
  await popup.close();
  await page.goto('https://evil.test/input.html');
  await openPopup();
  await popup.locator('#find').click();
  await expect(popup.locator('#status')).toHaveText('not a supported provider page');
  expect(await stored()).toEqual({});
});

test('KS-EXT-005 duplicate save requires explicit label-update confirmation', async () => {
  await openPopup();
  await unlock();
  await find();
  await popup.locator('#label').fill('First');
  await save();
  const before = (await stored()).vault;
  await find();
  await popup.locator('#label').fill('Updated');
  await popup.locator('#save').click();
  await expect(popup.locator('#confirm')).toBeVisible();
  expect((await stored()).vault).toEqual(before);
  await popup.locator('#confirm').click();
  await expect(popup.locator('#entries option')).toHaveCount(1);
  await expect(popup.locator('#entries')).toContainText('Updated');
});

test('KS-EXT-006 manual and idle locks fail closed; wrong passphrase cannot unlock', async () => {
  await openPopup();
  await unlock();
  await find();
  await save();
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
  await popup.locator('#fill').click();
  await expect(popup.locator('#status')).toContainText('Unlock');
});

test('KS-EXT-007 masked, negative and empty pages are ignored; reveal needs a new click', async () => {
  for (const name of ['negative', 'empty', 'reveal']) {
    await page.goto(`${origin}/${name}.html`);
    if (name === 'negative') await page.evaluate((value) => {
      const output = document.createElement('output');
      const hidden = document.createElement('span');
      hidden.style.opacity = '0';
      hidden.textContent = value;
      output.append(hidden);
      document.body.append(output);
    }, samples[0].value);
    await openPopup();
    await popup.locator('#find').click();
    await expect(popup.locator('#status')).toHaveText('No visible keys found');
    await popup.close();
  }
  await page.locator('#reveal').click();
  expect(await stored()).toEqual({});
  await openPopup();
  await find();
  await expect(popup.locator('#candidate option')).toHaveCount(1);
});

test('KS-USE-001 fill only the focused input on the saved origin; evil gets nothing', async () => {
  await openPopup();
  await unlock();
  await find();
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
