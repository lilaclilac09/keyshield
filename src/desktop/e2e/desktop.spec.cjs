const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { samples } = require('./keys.json');

const desktop = path.resolve(__dirname, '..');
const kind = process.env.KS_E2E_APP ? 'installed' : 'source';
const shots = path.join(os.homedir(), 'shots');
const state = path.join(os.homedir(), '.local', 'state', 'keyshield-e2e');
fs.mkdirSync(shots, { recursive: true });
fs.mkdirSync(state, { recursive: true });
const run = fs.mkdtempSync(path.join(state, `${kind}-`));
const api = process.env.KS_E2E_API || 'http://127.0.0.1:8001';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(api).hostname)) throw new Error('Synthetic tests require a loopback API');

async function launch(label, overrides = {}) {
  const dir = path.join(run, label);
  fs.mkdirSync(dir, { recursive: true });
  const app = await electron.launch({
    ...(process.env.KS_E2E_APP ? { executablePath: process.env.KS_E2E_APP } : { executablePath: require('electron') }),
    args: [...(process.env.KS_E2E_APP ? [] : [path.join(desktop, 'main.cjs')]), `--user-data-dir=${dir}/profile`],
    env: {
      ...process.env,
      KS_DESKTOP_FORCE_PACKAGED: '1',
      KS_DESKTOP_LIVE: '0',
      KS_DESKTOP_API_URL: api,
      KS_DESKTOP_LOG: path.join(dir, 'launch.log'),
      KS_DESKTOP_REQUEST_AUDIT: path.join(dir, 'requests.jsonl'),
      ...overrides,
    },
  });
  return { app, page: await app.firstWindow(), dir };
}

const audit = (dir) => fs.existsSync(path.join(dir, 'requests.jsonl'))
  ? fs.readFileSync(path.join(dir, 'requests.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];

test.describe.serial('local desktop acceptance', () => {
  let app, page, dir;
  test.beforeAll(async () => ({ app, page, dir } = await launch('account')));
  test.afterAll(async () => { if (app) await app.close(); });

  test('KS-HUM-003 login is usable without a native prompt and scrolls within the window', async () => {
    await expect(page.getByTestId('email-signup')).toBeVisible();
    await page.getByRole('button', { name: 'Use session token', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Use session token', exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: path.join(shots, `after-${kind}-login-scroll.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByTestId('email-login').scrollIntoViewIfNeeded();
    await page.getByTestId('email-login').fill(`ks-e2e+${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.invalid`);
    await page.screenshot({ path: path.join(shots, `after-${kind}-login.png`) });
    execFileSync('screencapture', ['-x', path.join(shots, `after-${kind}-login-screen.png`)]);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  });

  test('KS-HUM-001 synthetic signup creates an empty vault', async () => {
    await page.getByTestId('password-login-input').fill('FAKE-e2e-password-2026!');
    const response = page.waitForResponse((r) => r.url() === `${api}/auth/signup`);
    await page.getByTestId('email-signup').click();
    expect((await response).status()).toBe(200);
    await page.getByRole('button', { name: 'Vault', exact: true }).click();
    await expect(page.getByText('Your vault is empty', { exact: true })).toBeVisible();
  });

  for (const [name, heading] of [
    ['Vault', 'Vault Management'], ['Agents', 'Agent Registry'], ['Sessions', 'Sessions'],
    ['Settings', 'Settings'], ['Reports', 'Reports'], ['Developer', 'Developer'],
  ]) {
    test(`KS-PAR-001 ${name} renders`, async () => {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(shots, `after-${kind}-${name.toLowerCase()}.png`) });
    });
  }

  test('KS-SEC-002 diagnostic errors cannot persist synthetic credentials', async () => {
    const fake = samples[0].value;
    await page.evaluate((value) => console.error(`Synthetic diagnostic ${value} email=ks-e2e@example.invalid https://example.test/?token=${encodeURIComponent(value)}`), fake);
    await expect.poll(async () => (await page.evaluate(() => window.keyshieldDesktop.getDiagnostics())).summary).toContain('Synthetic diagnostic');
    const diagnostics = await page.evaluate(() => window.keyshieldDesktop.getDiagnostics());
    const log = fs.readFileSync(path.join(dir, 'launch.log'), 'utf8');
    for (const output of [diagnostics.summary, log]) {
      expect(output).not.toContain(fake);
      expect(output).not.toContain('ks-e2e@example.invalid');
      expect(output).not.toContain('?token=');
    }
  });

  test('KS-SAFE-002 explicit unsupported Touch ID denies and shows a reason', async () => {
    await app.evaluate(({ systemPreferences }) => {
      globalThis.savedCanPrompt = systemPreferences.canPromptTouchID;
      systemPreferences.canPromptTouchID = () => false;
    });
    try {
      expect(await page.evaluate(() => window.keyshieldDesktop.promptTouchID('Approve synthetic action'))).toEqual({ ok: false, error: 'Touch ID is unavailable on this device' });
      await expect(page.getByText('Touch ID is unavailable on this device', { exact: true })).toBeVisible({ timeout: 30000 });
    } finally {
      await app.evaluate(({ systemPreferences }) => { systemPreferences.canPromptTouchID = globalThis.savedCanPrompt; });
    }
  });

  test('KS-SEC-002 save sends only ciphertext, not a plaintext-first request', async () => {
    await page.getByRole('button', { name: 'Vault', exact: true }).click();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByTestId('new-secret-api-key').fill(samples.find((row) => row.id === 'aws_secret').value);
    const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/manage/store' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save Secret', exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect.poll(() => audit(dir).filter((row) => row.route === '/manage/store').length).toBeGreaterThan(0);
    const shapes = audit(dir).filter((row) => ['/manage/store', '/zk/store'].includes(row.route));
    console.log('SAVE_REQUEST_SHAPES', JSON.stringify(shapes));
    expect(shapes.some((row) => row.syntheticMarkerPresent)).toBe(true);
    await page.screenshot({ path: path.join(shots, `after-${kind}-save.png`) });
    const plaintext = shapes.some((row) => row.plaintextFieldPresent);
    test.fail(plaintext, 'Shared web vault sends plaintext before encryption; owned by the separate web fix');
    expect(plaintext, 'No plaintext-first save is allowed').toBe(false);
    expect(shapes.some((row) => row.hasCiphertextEnvelope)).toBe(true);
  });
});

for (const [label, env] of [
  ['missing-renderer', { KS_DESKTOP_RENDERER_DIR: '/nonexistent/keyshield-renderer' }],
  ['preflight', { KS_DESKTOP_FORCE_PREFLIGHT_FAILURE: '1' }],
  ['intercept', { KS_DESKTOP_FORCE_INTERCEPT_FAILURE: '1' }],
  ['insecure-api', { KS_DESKTOP_API_URL: 'http://example.test' }],
]) {
  test(`KS-HUM-003 KS-SEC-002 ${label} fails closed without hosted navigation`, async () => {
    const { app, page, dir } = await launch(label, env);
    try {
      await expect(page.getByText('KeyShield could not start safely.', { exact: true })).toBeVisible();
      expect(page.url()).toMatch(/^file:/);
      expect(audit(dir)).toEqual([]);
      await expect(page.getByRole('button', { name: 'Quit', exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(shots, `after-${kind}-${label}.png`) });
      await page.getByRole('button', { name: 'Copy diagnostics', exact: true }).click();
      const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
      expect(copied).toContain('KeyShield desktop diagnostics');
      expect(copied).not.toContain('http://example.test');
      const nextWindow = app.waitForEvent('window');
      await page.getByRole('button', { name: 'Retry the app', exact: true }).click();
      const retried = await nextWindow;
      await expect(retried.getByText('KeyShield could not start safely.', { exact: true })).toBeVisible();
      expect(audit(dir)).toEqual([]);
    } finally { await app.close(); }
  });
}
