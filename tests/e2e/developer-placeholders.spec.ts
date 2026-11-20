import { test, expect, type Page } from '@playwright/test';

const owner = 'synthetic-owner-credential-never-in-examples';
const agent = 'synthetic-agent-credential-never-in-examples';
const placeholder = '<YOUR_AGENT_TOKEN>';

async function checkExamples(page: Page) {
  const examples = page.locator('pre');
  expect(await examples.count()).toBeGreaterThan(10);
  let authenticatedExamples = 0;
  for (const example of await examples.all()) {
    const text = (await example.textContent())!;
    expect(text).not.toContain(owner);
    expect(text).not.toContain(agent);
    if (text.includes('Bearer') || text.includes('KeyShield(token=')) {
      expect(text).toContain(placeholder);
      authenticatedExamples++;
    }
    await example.locator('..').getByRole('button', { name: /^(Copy|Copied)$/ }).click();
    const copied = await page.evaluate(() => (window as any).__copied);
    expect(copied).toBe(text);
    expect(copied).not.toContain(owner);
    expect(copied).not.toContain(agent);
  }
  expect(authenticatedExamples).toBeGreaterThan(10);
}

test('Developer examples and Copy remain placeholders before and after minting', async ({ page }) => {
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('ks_token', owner);
    localStorage.setItem('ks_wallet', 'synthetic-wallet');
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async (text: string) => { (window as any).__copied = text; },
      readText: async () => (window as any).__copied ?? '',
    } });
  }, { owner });
  let mintAttempts = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5173') return route.continue();
    if (url.pathname === '/sessions/proxy-token') {
      expect(route.request().headers().authorization).toBe(`Bearer ${owner}`);
      expect(route.request().method()).toBe('POST');
      mintAttempts++;
      return route.fulfill({ status: mintAttempts === 1 ? 500 : 200,
        json: mintAttempts === 1 ? { detail: 'Synthetic mint failure' } : { token: agent } });
    }
    if (url.pathname === '/keychain/home') return route.fulfill({ status: 503, json: {} });
    if (url.pathname === '/manage/list') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 503, json: {} });
  });
  await page.goto('/?local=1');
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  await checkExamples(page);
  const mint = page.getByTestId('mint-agent-token');
  await mint.click();
  await expect(page.getByText('Synthetic mint failure', { exact: true })).toBeVisible();
  await mint.click();
  const field = page.getByText('Agent token', { exact: true }).locator('..');
  await expect(field.locator('code')).not.toHaveText(agent);
  await field.getByRole('button', { name: 'Reveal', exact: true }).click();
  await expect(field.locator('code')).toHaveText(agent);
  await field.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__copied)).toBe(agent);
  await field.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(field.locator('code')).not.toHaveText(agent);
  await checkExamples(page);
  expect(mintAttempts).toBe(2);
});
