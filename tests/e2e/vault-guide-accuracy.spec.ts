import { test, expect, type Locator, type Page } from '@playwright/test';

const owner = 'synthetic-owner-vault-guide';
const agent = 'synthetic-agent-vault-guide';
const providerKey = 'sk-or-v1-synthetic-vault-guide-only';
const oldClaims = /paste or extension detect|Detect writes this list|Detect on a key page|Agents use the proxy|decrypted key is injected per-request|agent never sees the raw API key|key injected automatically|Proxy injects per-request|Key injected per-request|ks\.openai_client\(|server decrypts your key in memory|extension detects a key/i;
const forbiddenDeviceClaims = /keyshield-proxy|\/vproxy|LOCAL_PROXY_URL|agents use/i;

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function openDashboard(page: Page, saved = false, offline = false) {
  await page.addInitScript(({ owner, agent }) => {
    localStorage.setItem('ks_token', owner);
    localStorage.setItem('ks_wallet', 'synthetic-vault-guide-wallet');
    localStorage.setItem('ks_agent_token', agent);
  }, { owner, agent });
  const writes: string[] = [];
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:5173') return route.continue();
    if (request.method() !== 'GET' && request.method() !== 'OPTIONS') writes.push(url.pathname);
    if (url.pathname === '/manage/vault' && !offline) {
      return route.fulfill({ json: { items: saved ? [{ id: 'synthetic-legacy-openai', upstream: 'openai', name: 'Synthetic saved OpenAI', masked_value: '••••fake' }] : [] } });
    }
    return route.fulfill({ status: 503, json: { detail: 'Synthetic backend offline' } });
  });
  await page.goto('/?local=1');
  return writes;
}

async function checkDeviceFlow(flow: Locator) {
  await expect(flow).toContainText('Per-agent use of Device Vault keys is not available in this app.');
  await expect(flow).toContainText(/Approval exists only as an opt-in\s+development mock, not in the packaged app\./);
  await expect(flow).not.toContainText(forbiddenDeviceClaims);
  await expect(flow.locator('pre')).toHaveCount(0);
}

async function checkGuide(page: Page) {
  await page.getByRole('button', { name: 'Unlock or create device vault', exact: true }).click();
  await expect(page.getByText('How to use Device Vault', { exact: true })).toBeVisible();
  await expect(page.getByText('Per-agent use is unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText(/only the ciphertext is synced to storage/)).toBeVisible();
  const consent = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Unlock or create device vault', exact: true }) });
  await checkDeviceFlow(consent);
  await expect(consent.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(0);
  await expect(page.locator('body')).toContainText('The Safari extension saves to its own separate vault.');
  await expect(page.locator('body')).not.toContainText(oldClaims);
}

for (const state of ['empty', 'saved', 'offline'] as const) {
  test(`Vault guidance distinguishes ciphertext sync from legacy plaintext (${state})`, async ({ page }) => {
    await openDashboard(page, state === 'saved', state === 'offline');
    await page.getByRole('button', { name: 'Vault', exact: true }).click();
    await expect(page.getByText('Keychain — paste a key', { exact: true })).toBeVisible();
    await expect(page.getByText(/keys are encrypted on this device and only ciphertext is synced/)).toBeVisible();
    await expect(page.getByText(/Legacy non-ZK \/manage\/store records are separate/)).toBeVisible();
    await checkDeviceFlow(page.locator('main'));
    if (state === 'saved') await expect(page.getByText('Synthetic saved OpenAI', { exact: true }).first()).toBeVisible();
    else await expect(page.getByText('Your vault is empty', { exact: true })).toBeVisible();
    if (state === 'offline') await expect(page.getByText('vault list failed (503)', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(oldClaims);
  });
}

for (const path of ['Keychain Save', 'Add Secret', 'Activity Connect'] as const) {
  test(`DeviceVaultConsent disclaims per-agent use without proxy commands via ${path}`, async ({ page }) => {
    const writes = await openDashboard(page);
    if (path === 'Activity Connect') {
      await page.getByRole('button', { name: 'Payments', exact: true }).click();
      await page.getByRole('button', { name: 'MPP Streams', exact: true }).click();
      await page.getByPlaceholder('sk-or-v1-… or copy the key, then Connect').fill(providerKey);
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Vault', exact: true }).click();
      if (path === 'Add Secret') {
        await page.getByRole('button', { name: 'Add Secret', exact: true }).first().click();
        await page.getByTestId('new-secret-api-key').fill(providerKey);
        await page.getByRole('button', { name: 'Save Secret', exact: true }).click();
      } else {
        await page.getByPlaceholder('sk-or-…  sk-proj-…  gsk_…  helius UUID…').fill(providerKey);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
      }
    }
    await expect(page.getByRole('button', { name: 'Unlock or create device vault', exact: true })).toBeVisible();
    await checkGuide(page);
    expect(writes).toEqual([]);
  });
}

test('Docs disclaims packaged-app detection and automatic device-key agent access', async ({ page }) => {
  await openDashboard(page);
  await page.getByRole('button', { name: 'Docs & Troubleshooting', exact: true }).click();
  await expect(page.getByText(/Extension detection is not available in the packaged app/)).toBeVisible();
  await expect(page.getByText(/The Safari extension saves to its own separate vault/)).toBeVisible();
  await expect(page.getByText(/Save \+ Call skips the call for device-encrypted keys/)).toBeVisible();
  for (const title of ['API keychain', 'Device Vault limitations']) {
    await checkDeviceFlow(page.getByText(title, { exact: true }).locator('..').locator('..'));
  }
  for (const title of ['Legacy OpenRouter proxy examples — separate from Device Vault', 'Legacy proxy example — separate from Device Vault']) {
    const legacy = page.getByText(title, { exact: true }).locator('..').locator('..');
    await expect(legacy).toContainText('separately sealed keys plus a server share, not dashboard Device Vault keys, and has no per-use approval');
  }
  const examples = page.locator('pre').filter({ hasText: 'Bearer <YOUR_AGENT_TOKEN>' });
  await expect(examples).toHaveCount(3);
  for (const example of await examples.all()) {
    const text = (await example.textContent())!;
    expect(text).toContain('<YOUR_AGENT_TOKEN>');
    expect(text).not.toContain('LOCAL_PROXY_URL');
    for (const secret of [owner, agent, providerKey]) expect(text).not.toContain(secret);
    await example.locator('..').getByRole('button', { name: 'Copy', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  }
  await expect(page.locator('body')).not.toContainText(oldClaims);
});
