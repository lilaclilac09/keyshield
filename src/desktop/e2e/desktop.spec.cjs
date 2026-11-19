const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { samples } = require('./keys.json');

const desktop = path.resolve(__dirname, '..');
const kind = process.env.KS_E2E_APP ? 'installed' : 'source';
const shots = path.join(os.homedir(), 'shots');
const state = path.join(os.homedir(), '.local', 'state', 'keyshield-e2e');
fs.mkdirSync(shots, { recursive: true });
fs.mkdirSync(state, { recursive: true });
const run = fs.mkdtempSync(path.join(state, `${kind}-`));
const api = process.env.KS_E2E_API || 'http://127.0.0.1:8001';
const sessions = [];
const fixtureValues = samples.flatMap(({ value }) => [value, value.split('::')[1]]).filter(Boolean);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(api).hostname)) throw new Error('Synthetic tests require a loopback API');

async function launch(label, overrides = {}) {
  const dir = path.join(run, label);
  fs.mkdirSync(dir, { recursive: true });
  const app = await electron.launch({
    ...(process.env.KS_E2E_APP ? { executablePath: process.env.KS_E2E_APP } : { executablePath: require('electron') }),
    args: [...(process.env.KS_E2E_APP ? [] : [path.join(desktop, 'main.cjs')]), `--user-data-dir=${dir}/profile`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
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
  const page = await app.firstWindow();
  const session = { app, page, dir, requests: 0, leaks: 0 };
  page.on('request', (request) => {
    session.requests++;
    const content = [request.url(), request.postData() || '', ...Object.values(request.headers())].join('\n');
    let decoded = content;
    try { decoded = decodeURIComponent(content); } catch {}
    if (fixtureValues.some((value) => decoded.includes(value))) session.leaks++;
  });
  sessions.push(session);
  return session;
}

const audit = (dir) => fs.existsSync(path.join(dir, 'requests.jsonl'))
  ? fs.readFileSync(path.join(dir, 'requests.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];

const saveRequests = (dir) => audit(dir).filter((row) => ['POST', 'PUT', 'PATCH'].includes(row.method)
  && (['/manage/store', '/zk/store'].includes(row.route) || row.route.startsWith('/vault/')));

function assertNoKeyRequests() {
  for (const session of sessions) {
    expect(session.leaks, 'No request URL, body or header may carry a synthetic key value').toBe(0);
    expect(audit(session.dir).filter((row) => row.syntheticMarkerPresent), 'Every audited request must be free of synthetic markers').toEqual([]);
  }
}

test.afterEach(assertNoKeyRequests);

async function signup(page) {
  await page.getByTestId('email-login').fill(`ks-e2e+${Date.now()}-${Math.random().toString(16).slice(2)}@example.invalid`);
  await page.getByTestId('password-login-input').fill('Synthetic-e2e-password-2026!');
  const response = page.waitForResponse((r) => r.url() === `${api}/auth/signup`);
  await page.getByTestId('email-signup').click();
  const signedUp = await response;
  expect(signedUp.ok()).toBe(true);
  const account = await signedUp.json();
  await page.getByRole('button', { name: 'Vault', exact: true }).click();
  await expect(page.getByText('Your vault is empty', { exact: true })).toBeVisible();
  return account;
}

async function unlockWithSyntheticPasskey(page, app) {
  const blobs = new Map();
  const prfBytes = [...randomBytes(32)];
  const worker = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') return res.end();
    if (req.url === '/auth/challenge') return res.end(JSON.stringify({ challenge: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB' }));
    if (req.url === '/auth/exchange') return res.end(JSON.stringify({ token: 'synthetic-e2e-sync-token', expiresAt: Date.now() + 3600000 }));
    if (req.url.startsWith('/vault/')) {
      if (req.method === 'PUT') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        blobs.set(req.url, Buffer.concat(chunks).toString('utf8'));
        return res.end('{}');
      }
      const blob = blobs.get(req.url);
      res.statusCode = blob ? 200 : 404;
      return res.end(blob || '{}');
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise((resolve) => worker.listen(0, '127.0.0.1', resolve));
  app.on('close', () => worker.close());
  const syncOrigin = `http://127.0.0.1:${worker.address().port}`;
  const reconnect = () => page.evaluate(({ api, syncOrigin, prfBytes }) => {
    localStorage.setItem('ks_passkey_user', 'synthetic-e2e-passkey-identity');
    const prf = new Uint8Array(prfBytes).buffer;
    const bytes = new Uint8Array(32).fill(1).buffer;
    Object.defineProperty(navigator.credentials, 'get', { configurable: true, value: async () => ({
      id: 'synthetic-e2e-passkey', rawId: bytes, type: 'public-key',
      response: { authenticatorData: bytes, clientDataJSON: bytes, signature: bytes, userHandle: bytes },
      getClientExtensionResults: () => ({ prf: { results: { first: prf } } }),
    }) });
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input.url || input.toString(), location.href);
      const json = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
      if (url.origin === new URL(api).origin && url.pathname === '/auth/passkey/auth-options') {
        return json({ challenge: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB', allowCredentials: [] });
      }
      if (['/auth/challenge', '/auth/exchange'].includes(url.pathname) || url.pathname.startsWith('/vault/')) return originalFetch(`${syncOrigin}${url.pathname}`, options);
      return originalFetch(input, options);
    };
  }, { api, syncOrigin, prfBytes });
  await reconnect();
  const card = page.getByTestId('zk-mode-card');
  await card.getByRole('button', { name: 'Unlock with passkey', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Turn on ZK mode', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Turn on ZK mode', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Show unlock code for keyshield-proxy', exact: true })).toBeVisible();
  return { blobs, reconnect };
}

async function prepareSecret(page, label, value = samples.find((row) => row.id === 'aws_secret').value) {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByPlaceholder('e.g. Production API key', { exact: true }).fill(label);
  await page.getByTestId('new-secret-api-key').fill(value);
  await page.locator('form select').first().selectOption('openai');
}

async function saveSecret(page, value, heading = 'OpenAI') {
  await prepareSecret(page, heading, value);
  const saved = page.waitForResponse((r) => ['POST', 'PUT'].includes(r.request().method())
    && (['/manage/store', '/zk/store'].includes(new URL(r.url()).pathname) || new URL(r.url()).pathname.startsWith('/vault/')) && r.ok());
  await page.getByRole('button', { name: 'Save Secret', exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  await expect(page.getByTestId('new-secret-api-key')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  return response.status();
}

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
    await signup(page);
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

});

test('KS-HUM-001 KS-SEC-001 KS-SEC-002 new vault first save succeeds with ciphertext on EVERY save request', async () => {
  const { app, page, dir } = await launch('unlocked-save');
  try {
    await signup(page);
    const fixture = await unlockWithSyntheticPasskey(page, app);
    expect(fixture.blobs.size).toBe(0);
    const status = await saveSecret(page, samples.find((row) => row.id === 'aws_secret').value);
    expect(fixture.blobs.size).toBe(1);
    console.log('UNLOCKED_SAVE_RESULT', JSON.stringify({ status, vaultListContainsKey: true }));
    const shapes = saveRequests(dir);
    console.log('UNLOCKED_SAVE_REQUEST_SHAPES', JSON.stringify(shapes));
    expect(shapes.length, 'At least one save request must be audited').toBeGreaterThan(0);
    expect.soft(shapes.filter((row) => row.plaintextFieldPresent), 'Plaintext observed in unlocked vault save').toEqual([]);
    expect(shapes.every((row) => row.hasCiphertextEnvelope && !row.plaintextFieldPresent), 'EVERY save request must contain ciphertext and no plaintext').toBe(true);
  } finally { await app.close(); }
});

test('KS-HUM-002 KS-SEC-001 KS-SEC-002 two same-provider FAKE keys save separately without plaintext', async () => {
  const { app, page, dir } = await launch('same-provider');
  try {
    await signup(page);
    await unlockWithSyntheticPasskey(page, app);
    const first = samples.find((row) => row.id === 'openai').value;
    const second = `${first.slice(0, -1)}B`;
    fixtureValues.push(second, second.split('::')[1]);
    await saveSecret(page, first);
    await saveSecret(page, second, 'OpenAI#2');
    await expect(page.getByRole('heading', { name: 'OpenAI', exact: true })).toBeVisible();
    const shapes = saveRequests(dir);
    console.log('SAME_PROVIDER_SAVE_REQUEST_SHAPES', JSON.stringify(shapes));
    expect(shapes.length).toBeGreaterThanOrEqual(2);
    expect(shapes.every((row) => row.hasCiphertextEnvelope && !row.plaintextFieldPresent)).toBe(true);
  } finally { await app.close(); }
});

test('KS-USE-002 KS-SEC-002 explicit reveal alone exposes a FAKE value, never logs or audit', async () => {
  const { app, page, dir } = await launch('reveal');
  try {
    await signup(page);
    await unlockWithSyntheticPasskey(page, app);
    const value = samples.find((row) => row.id === 'openai').value;
    const extracted = value.split('::')[1];
    await saveSecret(page, value);
    await expect(page.locator('body')).not.toContainText(extracted);
    await page.getByTitle('Reveal', { exact: true }).click();
    await expect(page.getByText(extracted, { exact: true })).toBeVisible();
    await page.getByTitle('Hide', { exact: true }).click();
    await expect(page.locator('body')).not.toContainText(extracted);
    const diagnostics = await page.evaluate(() => window.keyshieldDesktop.getDiagnostics());
    for (const output of [diagnostics.summary, fs.readFileSync(path.join(dir, 'launch.log'), 'utf8'), fs.readFileSync(path.join(dir, 'requests.jsonl'), 'utf8')]) {
      expect(output).not.toContain(value);
      expect(output).not.toContain(extracted);
    }
  } finally { await app.close(); }
});

test('KS-AGT-001 KS-SEC-002 Developer, Docs and Agent session examples retain placeholders after token creation', async () => {
  const { app, page } = await launch('developer-placeholders');
  try {
    const account = await signup(page);
    await page.getByRole('button', { name: 'Developer', exact: true }).click();
    const minted = page.waitForResponse((r) => new URL(r.url()).pathname === '/sessions/proxy-token' && r.request().method() === 'POST');
    await page.getByTestId('mint-agent-token').click();
    const response = await minted;
    expect(response.ok()).toBe(true);
    const { token } = await response.json();
    expect(typeof token).toBe('string');
    await expect(page.getByText('Agent token', { exact: true })).toBeVisible();
    const snippets = await page.locator('pre').allTextContents();
    expect(snippets.length).toBeGreaterThan(10);
    expect(snippets.join('\n')).not.toContain(token);
    expect(snippets.join('\n')).not.toContain(account.token);
    const authenticated = snippets.filter((text) => /Bearer|KeyShield\(token=/.test(text));
    expect(authenticated.length).toBeGreaterThan(5);
    for (const text of authenticated) expect(text).toContain('<YOUR_AGENT_TOKEN>');
    for (const example of await page.locator('pre').all()) {
      const text = await example.textContent();
      await example.locator('..').getByRole('button', { name: /^(Copy|Copied)$/ }).click();
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(text);
    }
    await page.getByRole('button', { name: 'Docs & Troubleshooting', exact: true }).click();
    const docs = page.locator('pre');
    const docsText = await docs.allTextContents();
    expect(docsText.filter((text) => text.includes('Bearer <YOUR_AGENT_TOKEN>')).length).toBe(3);
    expect(docsText.join('\n')).not.toContain(token);
    expect(docsText.join('\n')).not.toContain(account.token);
    for (const example of await docs.filter({ hasText: /Bearer <YOUR_AGENT_TOKEN>/ }).all()) {
      const text = await example.textContent();
      await example.locator('..').getByRole('button', { name: /^(Copy|Copied)$/ }).click();
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(text);
    }
    await page.evaluate((token) => {
      localStorage.setItem('ks_token', token);
      localStorage.removeItem('ks_session_scope');
      localStorage.setItem('ks_auth_method', 'agent');
    }, token);
    await page.reload();
    const agentExample = page.getByTestId('agent-session').locator('pre');
    await expect(agentExample).toContainText('<YOUR_AGENT_TOKEN>');
    const agentText = await agentExample.textContent();
    expect(agentText).not.toContain(token);
    expect(agentText).not.toContain(account.token);
    await agentExample.locator('..').getByRole('button', { name: /^(Copy|Copied)$/ }).click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(agentText);
  } finally { await app.close(); }
});

test('KS-HUM-002 KS-SEC-001 KS-SEC-002 labels and expiry survive encrypted save and reload', async () => {
  const { app, page, dir } = await launch('metadata');
  try {
    await signup(page);
    const fixture = await unlockWithSyntheticPasskey(page, app);
    const label = 'Synthetic labeled production credential';
    const expiry = '2031-12-31';
    fixtureValues.push(label, expiry);
    await prepareSecret(page, label);
    await page.locator('input[type="date"]').fill(expiry);
    const saved = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname.startsWith('/vault/') && response.ok());
    await page.getByRole('button', { name: 'Save Secret', exact: true }).click();
    await saved;
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await expect(page.getByText(`expires ${expiry}`, { exact: false }).first()).toBeVisible();
    expect(fixture.blobs.size).toBe(1);
    for (const blob of fixture.blobs.values()) {
      expect(blob).not.toContain(label);
      expect(blob).not.toContain(expiry);
    }
    await page.reload();
    await fixture.reconnect();
    await page.getByRole('button', { name: 'Vault', exact: true }).click();
    await page.getByTestId('zk-mode-card').getByRole('button', { name: 'Unlock with passkey', exact: true }).click();
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await expect(page.getByText(`expires ${expiry}`, { exact: false }).first()).toBeVisible();
    const shapes = saveRequests(dir);
    console.log('METADATA_SAVE_REQUEST_SHAPES', JSON.stringify(shapes));
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect(shape.bodyFieldNames).toEqual(['ciphertext', 'iv', 'updatedAt', 'version']);
      expect(shape.hasCiphertextEnvelope && !shape.plaintextFieldPresent).toBe(true);
    }
  } finally { await app.close(); }
});

test('KS-SEC-002 every audited request is free of synthetic key values', async () => {
  const session = await launch('all-requests');
  const { app, page, dir } = session;
  try {
    await signup(page);
    await unlockWithSyntheticPasskey(page, app);
    await saveSecret(page, samples.find((row) => row.id === 'openai').value);
    expect(audit(dir).length).toBeGreaterThan(0);
    expect(session.requests).toBeGreaterThan(0);
    assertNoKeyRequests();
  } finally { await app.close(); }
});

test('KS-USE-001 Save + Call', () => {
  test.skip(true, 'Save + Call requires provider usage and consent wiring outside this pinned renderer; no external provider calls are permitted in this local fixture run.');
});

test('KS-SEC-001 KS-SEC-002 KS-SAFE-001 locked vault refuses a save and stores nothing', async ({ request }) => {
  const { app, page, dir } = await launch('locked-save');
  try {
    const account = await signup(page);
    // A fresh email session has neither vault-session state nor an in-memory ZK root.
    await expect(page.getByTestId('zk-mode-card').getByRole('button', { name: 'Unlock with passkey', exact: true })).toBeVisible();
    const list = async () => {
      const response = await request.get(`${api}/manage/vault`, { headers: { Authorization: `Bearer ${account.token}` } });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    expect((await list()).length).toBe(0);
    await prepareSecret(page, `FAKE desktop locked ${Date.now()}`);
    await page.getByRole('button', { name: 'Save Secret', exact: true }).click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).some((button) => button.disabled && /Encrypting|Saving/.test(button.textContent)));
    const shapes = saveRequests(dir);
    const rows = await list();
    console.log('LOCKED_SAVE_REQUEST_SHAPES', JSON.stringify(shapes));
    console.log('LOCKED_BACKEND_ITEM_COUNT', rows.length);
    expect.soft(shapes.filter((row) => row.plaintextFieldPresent), 'Plaintext observed while vault is locked').toEqual([]);
    expect.soft(rows.length, 'A refused locked-vault save must not create a backend item').toBe(0);
    await expect(page.locator('form').getByText(/(?:unlock|locked|cannot save|refused)/i)).toBeVisible();
  } finally { await app.close(); }
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
