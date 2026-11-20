import { expect, test, type Page, type Request } from '@playwright/test';
import { bridgeWebAuthnGet, virtualPrfAuthenticator } from './webauthn-bridge';

test.use({
  trace: 'off',
  baseURL: 'http://localhost:5176',
  ...(process.env.CHROME_BIN ? { launchOptions: { executablePath: process.env.CHROME_BIN } } : {}),
});
test.skip(process.env.PW_VAULT_TUTORIAL !== '1', 'Start the real local stack with scripts/vault-sync-tutorial-e2e.mjs');

const draft = (page: Page) => page.getByPlaceholder('sk-or-…  sk-proj-…  gsk_…  helius UUID…');
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const entries = (page: Page) => page.getByTestId('vault-saved-apis').locator('strong');
const isPut = (request: Request) => request.method() === 'PUT' && new URL(request.url()).pathname.startsWith('/__sync/vault/');

test('novice stale-tab recovery — synthetic data, CDP virtual PRF authenticator, tab-B bridge, real local servers', async ({ page: a, context }, info) => {
  test.setTimeout(180_000);
  context.setDefaultTimeout(15_000);
  info.annotations.push(
    { type: 'mock-boundary', description: 'CDP virtual PRF authenticator substitutes hardware/user touch; tab B bridges navigator.credentials.get to A.' },
    { type: 'synthetic-data', description: 'Fresh email/password and fake provider keys only.' },
    { type: 'real-services', description: 'Local dashboard :5176, Python backend :8004, Wrangler/R2 sync worker :8790. No response mocks or seeded sessions.' },
    { type: 'network-safety', description: 'Only local dashboard/backend requests continue. External fonts/stylesheets are blocked (fallback fonts); other off-stack traffic fails the test.' },
  );
  // Synthetic-data boundary: these repetitive strings are not live credentials.
  const keys = [`sk-proj-${'A'.repeat(48)}`, `gsk_${'B'.repeat(48)}`, `sk-or-v1-${'C'.repeat(64)}`];
  const requests: Request[] = [];
  const blocked: string[] = [];
  const consoles: Array<Promise<string>> = [];
  const watchConsole = (page: Page) => page.on('console', message => consoles.push(Promise.all(message.args().map(arg => arg.jsonValue().catch(() => null))).then(args => JSON.stringify([message.text(), args]))));
  watchConsole(a);
  context.on('page', watchConsole);
  // Safety boundary, not a response mock: fail closed rather than contact a
  // recording/production backend if app configuration falls back unexpectedly.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http://localhost:5176', 'http://localhost:8004'].includes(url.origin)) return route.continue();
    if (route.request().method() === 'GET' && ['stylesheet', 'font'].includes(route.request().resourceType())) {
      return route.abort('blockedbyclient');
    }
    blocked.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  context.on('request', request => requests.push(request));
  const safeScreenshot = async (page: Page, path: string) => {
    const token = await page.evaluate(() => localStorage.getItem('ks_token'));
    const text = await page.locator('body').textContent() ?? '';
    expect(token && [token, token.slice(0, 12), token.slice(-6)].some(value => text.includes(value)), 'No token fragments before screenshot').toBe(false);
    expect(await page.locator('input[type="password"]').evaluateAll(inputs => inputs.some(input => (input as HTMLInputElement).value.length > 0))).toBe(false);
    await page.screenshot({ path, fullPage: true });
  };
  const puts: { tab: Page; status: number; base: string | undefined }[] = [];
  context.on('response', response => {
    if (isPut(response.request())) puts.push({
      tab: response.frame().page(), status: response.status(), base: response.request().headers()['x-vault-base-revision'],
    });
  });
  const cdp = await virtualPrfAuthenticator(context, a);
  try {
    await a.goto('/?local=1');
    await a.getByTestId('email-login').fill(`tutorial-${Date.now()}-${info.workerIndex}@example.test`);
    await a.getByTestId('password-login-input').fill(`Synthetic-${crypto.randomUUID()}!`);
    const signup = a.waitForResponse(r => r.url() === 'http://localhost:8004/auth/signup' && r.request().method() === 'POST');
    await a.getByTestId('email-signup').click();
    expect((await signup).status()).toBe(200);
    await a.getByRole('button', { name: 'Home', exact: true }).click();
    await a.getByTestId('home-open-vault').click();
    await expect(a.getByRole('button', { name: 'Unlock or create device vault', exact: true })).toBeVisible();
    await draft(a).fill(keys[0]);
    await save(a).click();
    await expect(draft(a)).toHaveValue(keys[0]);
    expect(puts).toHaveLength(0);
    await a.getByRole('button', { name: 'Unlock or create device vault', exact: true }).click();
    const registered = a.waitForResponse(r => r.url().endsWith('/auth/passkey/register-verify'));
    const enrolled = a.waitForResponse(r => r.url().endsWith('/__sync/auth/register'));
    await a.getByRole('button', { name: 'Enroll passkey', exact: true }).click();
    expect((await registered).status()).toBe(200);
    expect((await enrolled).status()).toBe(200);
    await expect(a.getByRole('button', { name: 'Lock', exact: true })).toBeVisible();
    await save(a).click();
    await expect(entries(a)).toHaveCount(1);
    await expect(a.getByText('Vault sync: last change saved', { exact: true })).toBeVisible();
    expect(puts.map(p => p.status)).toEqual([200]);
    expect(puts[0].base).toBe('none');
    const firstPut = requests.find(isPut)!;
    const missingBase = await context.request.put(firstPut.url(), {
      headers: { Authorization: (await firstPut.allHeaders()).authorization }, data: firstPut.postDataJSON(),
    });
    expect(missingBase.status()).toBe(428);
    expect(await missingBase.text()).toContain('Update KeyShield');
    console.log('Missing revision header: HTTP 428 with update-needed message.');
    await expect(draft(a)).toHaveValue('');
    await a.getByRole('button', { name: 'Home', exact: true }).click();
    await safeScreenshot(a, info.outputPath('home-vault-cta.png'));
    await a.getByTestId('home-open-vault').click();

    const b = await context.newPage();
    await bridgeWebAuthnGet(a, b);
    await b.goto('/?local=1');
    await b.getByRole('button', { name: 'Vault', exact: true }).click();
    // The novice save action reveals the same consent/unlock UI, without a module-level shortcut.
    await draft(b).fill(keys[1]);
    await save(b).click();
    await b.getByRole('button', { name: 'Unlock or create device vault', exact: true }).click();
    await b.getByRole('button', { name: 'Unlock vault', exact: true }).click();
    await expect(entries(b)).toHaveCount(1);
    const bSave = b.waitForResponse(r => isPut(r.request()));
    await save(b).click();
    expect((await bSave).status()).toBe(200);
    await expect(entries(b)).toHaveCount(2);
    await expect(entries(a)).toHaveCount(1);

    await draft(a).fill(keys[2]);
    const before = puts.length;
    const attemptsBefore = requests.filter(isPut).length;
    const stale = a.waitForResponse(r => isPut(r.request()));
    await save(a).click();
    expect((await stale).status()).toBe(409);
    const conflict = a.getByText('Key NOT saved: the vault changed in another tab/device. Reload and unlock to refresh.', { exact: true });
    await expect(conflict).toBeVisible();
    await expect(draft(a)).toHaveValue(keys[2]);
    await expect(entries(a)).toHaveCount(1);
    // Same polling/no-retry observation window as vault-sync-failure-state.spec.ts.
    await a.waitForTimeout(6500);
    expect(requests.filter(isPut)).toHaveLength(attemptsBefore + 1);
    expect(puts.slice(before).map(p => p.status)).toEqual([409]);
    expect(puts.filter(p => p.status === 409)).toHaveLength(1);
    const bPut = puts.find(p => p.tab === b)!;
    expect(puts[before].base).toBe(bPut.base);
    expect(bPut.base).toMatch(/^\d+$/);
    await expect(conflict).toBeVisible();
    await draft(a).fill('');
    await safeScreenshot(a, info.outputPath('stale-tab-conflict.png'));

    await a.reload();
    await a.getByRole('button', { name: 'Vault', exact: true }).click();
    await draft(a).fill(keys[2]);
    await save(a).click();
    await a.getByRole('button', { name: 'Unlock or create device vault', exact: true }).click();
    await a.getByRole('button', { name: 'Unlock vault', exact: true }).click();
    await expect(entries(a)).toHaveCount(2);
    await expect(entries(a).filter({ hasText: 'Groq' })).toBeVisible();
    const retry = a.waitForResponse(r => isPut(r.request()));
    await save(a).click();
    expect((await retry).status()).toBe(200);
    await expect(entries(a)).toHaveCount(3);
    await expect(a.getByText('Vault sync: last change saved', { exact: true })).toBeVisible();
    await expect(a.getByText(/Key NOT saved:/)).toHaveCount(0);
    expect(puts.slice(before).map(p => p.status)).toEqual([409, 200]);
    expect(requests.filter(isPut)).toHaveLength(attemptsBefore + 2);
    expect(puts.at(-1)!.base).not.toBe(bPut.base);
    await safeScreenshot(a, info.outputPath('recovered-vault.png'));
  } finally {
    // Browser teardown on a timeout may have already detached this session.
    await cdp.detach().catch(() => {});
    // Inspect every outgoing browser request, including failures, diagnostics,
    // URL/query, complete headers and bodies; never print a leaked credential.
    const leaks: string[] = [];
    for (const request of requests) {
      if (isPut(request)) expect(Object.keys(request.postDataJSON()).sort()).toEqual(['ciphertext', 'iv', 'updatedAt', 'version']);
      const wire = `${request.url()}\n${JSON.stringify(await request.allHeaders())}\n${request.postData() ?? ''}`;
      if (keys.some(key => wire.includes(key) || wire.includes(encodeURIComponent(key)))) {
        leaks.push(`${request.method()} request #${requests.indexOf(request)}`);
      }
    }
    const consoleOutput = (await Promise.all(consoles)).join('\n');
    expect(keys.some(key => consoleOutput.includes(key)), 'No synthetic API key in browser console output').toBe(false);
    expect(leaks, 'No synthetic API key may appear in any outgoing request').toEqual([]);
    expect(blocked, 'No traffic outside the isolated stack').toEqual([]);
    expect(requests.some(r => r.url().includes('/manage/store'))).toBe(false);
  }
});
