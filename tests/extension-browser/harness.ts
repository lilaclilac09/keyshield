import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:https';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const fixtures = resolve(root, 'tests/fixtures/extension-acceptance');
const { samples, negatives } = JSON.parse(readFileSync(resolve(fixtures, 'keys.json'), 'utf8'));
const origin = 'https://dashboard.provider.test';
const { allowed_capture_origins: approvedOrigins } = JSON.parse(readFileSync(resolve(fixtures, 'policy.json'), 'utf8'));
const secondOrigin = approvedOrigins[1];
const mockHosts = [...approvedOrigins.map((url: string) => new URL(url).hostname), 'evil.test', 'dashboard.vault.test'];
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
let output: string;
let networkRequests: { url: string; method: string; body: string; headers: Record<string, string> }[] = [];

export function installHarness({ nativeViewport = false, headless = process.env.KEYSHIELD_TUTORIAL_RECORD !== '1' } = {}) {
  test.beforeAll(async () => {
    const parent = resolve(root, 'dist/extension-acceptance');
    mkdirSync(parent, { recursive: true });
    output = mkdtempSync(resolve(parent, 'run-'));
    build = resolve(output, 'extension');
    execFileSync('node', ['src/extension/build.mjs', build], { cwd: root });
    const policy = resolve(build, 'lib/policy.js');
    writeFileSync(policy, readFileSync(policy, 'utf8').replace('Object.freeze([', `Object.freeze([${approvedOrigins.map((url: string) => JSON.stringify(url)).join(',')},`));
    const recognizer = resolve(build, 'lib/recognize.js');
    writeFileSync(recognizer, readFileSync(recognizer, 'utf8').replace(/export const PATTERNS = Object.freeze\([\s\S]*?\n\]\);/, `export const PATTERNS = Object.freeze(${JSON.stringify(samples.map((sample) => ({ provider: sample.provider, source: sample.regex })))});`));
    const background = resolve(build, 'background.js');
    writeFileSync(background, `${readFileSync(background, 'utf8')}\nglobalThis.__test = { select: handleSelection, state: () => ({ pending, entries: vault.entries, menuOptions }) };\n`);
    const manifestPath = resolve(build, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const mockPermissions = approvedOrigins.map((url: string) => `${url}/*`);
    manifest.optional_host_permissions.push(...mockPermissions);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    grantedBuild = resolve(output, 'extension-granted');
    rmSync(grantedBuild, { recursive: true, force: true });
    cpSync(build, grantedBuild, { recursive: true });
    writeFileSync(resolve(grantedBuild, 'manifest.json'), JSON.stringify({ ...manifest, host_permissions: mockPermissions }));
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
    const profile = mkdtempSync(resolve(output, 'profile-'));
    const extension = info.title.startsWith('KS-EXT-004') ? build : grantedBuild;
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless, ignoreHTTPSErrors: true,
      viewport: nativeViewport ? null : undefined,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-proxy-server', '--ignore-certificate-errors', `--host-resolver-rules=${mockHosts.map((host: string) => `MAP ${host} 127.0.0.1:${port}`).join(', ')}`],
    });
    networkRequests = [];
    context.on('request', (request) => networkRequests.push({ url: request.url(), method: request.method(), body: request.postData() || '', headers: request.headers() }));
    await context.route(/^https?:\/\//, (route) => mockHosts.includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
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
    if (popup && !popup.isClosed()) await popup.screenshot({ path: resolve(output, `${info.title.split(' ')[0]}.png`), fullPage: true });
    await context?.close();
  });
}
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

export { test, expect, samples, negatives, origin, secondOrigin, passphrase, page, popup, worker, context, output, networkRequests, openPopup, unlock, add, save, stored, state, selection };
