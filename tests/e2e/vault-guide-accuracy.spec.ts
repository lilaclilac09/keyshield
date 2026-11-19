import { test, expect, type Page } from '@playwright/test';

const owner = 'synthetic-owner-vault-guide';
const agent = 'synthetic-agent-vault-guide';
const providerKey = 'sk-or-v1-synthetic-vault-guide-only';
const command = ["curl '<LOCAL_PROXY_URL>/vproxy/openai/v1/models' \\", "  -H 'Authorization: Bearer <YOUR_AGENT_TOKEN>'"].join('\n');
const oldClaims = /paste or extension detect|Detect writes this list|Detect on a key page|Agents use the proxy|decrypted key is injected per-request|agent never sees the raw API key|key injected automatically|Proxy injects per-request|Key injected per-request|ks\.openai_client\(|server decrypts your key in memory|extension detects a key/i;

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

async function checkGuide(page: Page) {
  await page.getByRole('button', { name: 'Unlock or create device vault', exact: true }).click();
  await expect(page.getByText('How to use Device Vault', { exact: true })).toBeVisible();
  await expect(page.getByText('Configure a local proxy for agents', { exact: true })).toBeVisible();
  await expect(page.getByText(/Device-encrypted keys need a local keyshield-proxy; the hosted \/vproxy cannot decrypt them/)).toBeVisible();
  await expect(page.getByText(/only the ciphertext is synced to storage/)).toBeVisible();
  await expect(page.locator('body')).toContainText('Agent approval is an opt-in mock and is not available in the packaged app.');
  await expect(page.locator('body')).toContainText('The Safari extension saves to its own separate vault.');
  await expect(page.locator('body')).not.toContainText(oldClaims);
  const example = page.locator('pre').filter({ hasText: '<LOCAL_PROXY_URL>/vproxy/' });
  await expect(example).toHaveCount(1);
  await expect(example).toHaveText(command);
  await example.locator('..').getByRole('button', { name: 'Copy', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(command);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('<YOUR_AGENT_TOKEN>');
  expect(copied).toContain('<LOCAL_PROXY_URL>');
  for (const secret of [owner, agent, providerKey]) expect(copied).not.toContain(secret);
  expect(copied).not.toMatch(/\/manage\/|X-Upstream-API-Key|YOUR_SESSION_TOKEN|keyshield_sdk/);
}

for (const state of ['empty', 'saved', 'offline'] as const) {
  test(`Vault guidance distinguishes ciphertext sync from legacy plaintext (${state})`, async ({ page }) => {
    await openDashboard(page, state === 'saved', state === 'offline');
    await page.getByRole('button', { name: 'Vault', exact: true }).click();
    await expect(page.getByText('Keychain — paste a key', { exact: true })).toBeVisible();
    await expect(page.getByText(/keys are encrypted on this device and only ciphertext is synced/)).toBeVisible();
    await expect(page.getByText(/Legacy non-ZK \/manage\/store records are separate/)).toBeVisible();
    await expect(page.getByText(/Device-encrypted keys need a local keyshield-proxy configured/)).toBeVisible();
    if (state === 'saved') await expect(page.getByText('Synthetic saved OpenAI', { exact: true }).first()).toBeVisible();
    else await expect(page.getByText('Your vault is empty', { exact: true })).toBeVisible();
    if (state === 'offline') await expect(page.getByText('vault list failed (503)', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(oldClaims);
  });
}

for (const path of ['Keychain Save', 'Add Secret', 'Activity Connect'] as const) {
  test(`DeviceVaultConsent reveals accurate guide and placeholder-only Copy via ${path}`, async ({ page }) => {
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
  await expect(page.getByText(/Hosted \/vproxy cannot decrypt device-encrypted keys/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(oldClaims);
});
