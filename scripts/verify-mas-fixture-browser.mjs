import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { chromium } from '@playwright/test';

const dist = path.resolve(process.argv[2] ?? 'src/web/dist');
const output = path.resolve(process.argv[3] ?? path.join(homedir(), 'screenshots/keyshield-mas-fixture'));
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(output, 'browser-profile-'));
const origin = 'http://127.0.0.1:5177';
const requests = [];
const offBundle = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.resolve(dist, relative);
    if (!file.startsWith(`${dist}/`)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5177, '127.0.0.1', resolve); });
let context;
async function launch(handshake) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, serviceWorkers: 'block', viewport: { width: 1200, height: 800 },
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
  });
  // Test boundary: simulate only the MAS desktop preload handshake, not vault
  // state, storage or network. Real production bundle and browser persistence.
  await context.addInitScript(syntheticOnly => {
    window.__fixturePasteListeners = 0;
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, ...args) {
      if (type === 'paste') window.__fixturePasteListeners++;
      return add.call(this, type, ...args);
    };
    if (syntheticOnly) window.keyshieldDesktop = { syntheticOnly: true };
  }, handshake);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    const bundled = url.origin === origin && (url.pathname === '/' || url.pathname === '/renderer-profile.json' || url.pathname.startsWith('/assets/'));
    if (!bundled) { offBundle.push(route.request().url()); return route.abort('blockedbyclient'); }
    return route.continue();
  });
  context.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  return context.pages()[0];
}
async function audit(page) {
  assert.equal(await page.locator('input, textarea, select, form, [contenteditable], [onpaste], [type=file]').count(), 0);
  assert.equal(await page.evaluate(() => window.__fixturePasteListeners), 0);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('*')].some(node => node.onpaste !== null)), false);
  assert.equal(offBundle.length, 0);
}
try {
  let page = await launch(false);
  await page.goto(origin);
  await page.getByTestId('fixture-refusal').waitFor();
  assert.equal(await page.locator('button').count(), 0);
  await audit(page);
  await page.screenshot({ path: path.join(output, 'mas-refusal.png') });
  await context.close();

  page = await launch(true);
  // Runtime parameters/storage cannot switch the baked profile.
  await page.goto(`${origin}/?profile=standard&VITE_KEYSHIELD_RENDERER_PROFILE=standard`);
  await page.getByTestId('fixture-unlock').click();
  assert.equal(await page.getByTestId('fixture-entry').count(), 1);
  await page.getByTestId('fixture-entry').click();
  await page.getByText('Demo key saved on this device.', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'mas-selected.png') });
  const stored = await page.evaluate(() => localStorage.getItem('ks-mas-fixture:v1'));
  assert.ok(stored && !stored.includes('FAKE_KEYSHIELD_NOT_A_KEY::') && !stored.includes('Demo key'));
  assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ['ciphertext', 'iv', 'locked', 'version']);
  await page.getByTestId('fixture-lock').click();
  await page.getByText('Fixture vault locked', { exact: true }).waitFor();
  await audit(page);
  await page.screenshot({ path: path.join(output, 'mas-locked.png') });
  await context.close();

  page = await launch(true);
  await page.goto(origin);
  await page.getByText('Fixture vault locked', { exact: true }).waitFor();
  await page.getByTestId('fixture-unlock').click();
  await page.getByText('Demo key saved on this device.', { exact: true }).waitFor();
  await page.getByText('Fixture vault unlocked', { exact: true }).waitFor();
  assert.equal(await page.getByTestId('fixture-entry').isDisabled(), true);
  await audit(page);
  await page.screenshot({ path: path.join(output, 'mas-reopened.png') });
  await page.evaluate(() => {
    const key = 'ks-mas-fixture:v1', record = JSON.parse(localStorage.getItem(key));
    record.ciphertext = 'AAAA'; localStorage.setItem(key, JSON.stringify(record));
  });
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'Fixture data rejected' }).waitFor();
  assert.equal(await page.getByTestId('fixture-entry').count(), 0);
  await page.screenshot({ path: path.join(output, 'mas-tampered-rejected.png') });
  await audit(page);
  await context.close();
  console.log('MAS browser PASS: versioned ciphertext only; tampered state visibly rejected without an entry.');
  console.log('MAS browser PASS: handshake refusal; exactly one synthetic selection; lock, browser quit/relaunch, unlock retain the selected entry.');
  console.log(`MAS browser PASS: ${requests.length} bundle requests; ${offBundle.length} off-bundle requests; 0 credential inputs; 0 paste listeners/handlers. No API/sync server used.`);
} finally {
  await context?.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, 'requests.json'), JSON.stringify({ requests, offBundle }, null, 2));
}
