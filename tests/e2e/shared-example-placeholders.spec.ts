import { test, expect, type Page } from '@playwright/test';

const owner = 'synthetic-owner-secret-not-for-examples';
const agent = `${Buffer.from(JSON.stringify({ scp: 'proxy', uid: 'synthetic-agent' })).toString('base64url')}.synthetic-signature`;
const placeholder = '<YOUR_AGENT_TOKEN>';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function seedSession(page: Page, token: string) {
  await page.addInitScript(({ token }) => {
    localStorage.setItem('ks_token', token);
    localStorage.setItem('ks_wallet', 'synthetic-wallet');
  }, { token });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5173') return route.continue();
    return route.fulfill({ status: 503, json: { detail: 'Synthetic backend offline' } });
  });
}

async function checkExample(page: Page, text: string) {
  expect(text).toContain(placeholder);
  expect(text).not.toContain(owner);
  expect(text).not.toContain(agent);
  expect(text).toContain('/vproxy/');
  expect(text).not.toContain('/manage/');
  expect(text).not.toContain('<YOUR_SESSION_TOKEN>');
  expect(text).not.toMatch(/ks\.store\(|KS_VAULT_PASS|sk-proj-|sk-or-v1-/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text);
}

test('Docs examples display and natively copy placeholders, not the owner credential', async ({ page }) => {
  await seedSession(page, owner);
  await page.goto('/?local=1');
  await page.getByRole('button', { name: 'Docs & Troubleshooting', exact: true }).click();
  const examples = page.locator('pre').filter({ hasText: /Bearer <YOUR_AGENT_TOKEN>/ });
  await expect(examples).toHaveCount(3);
  for (const example of await examples.all()) {
    const text = (await example.textContent())!;
    await example.locator('..').getByRole('button', { name: 'Copy', exact: true }).click();
    await checkExample(page, text);
  }
  for (const example of await page.locator('pre').all()) {
    const text = (await example.textContent())!;
    expect(text).not.toContain(owner);
    expect(text).not.toContain(agent);
  }
});

test('Developer examples only use proxy scope and never offer plaintext key storage', async ({ page }) => {
  await seedSession(page, owner);
  let attempts = 0;
  await page.route('**/sessions/proxy-token', route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${owner}`);
    attempts++;
    return route.fulfill({ status: attempts === 1 ? 500 : 200,
      json: attempts === 1 ? { detail: 'Synthetic mint failure' } : { token: agent } });
  });
  await page.goto('/?local=1');
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  const checkExamples = async () => {
    const examples = page.locator('pre');
    await expect(examples).toHaveCount(12);
    for (const example of await examples.all()) {
      const text = (await example.textContent())!;
      await example.locator('..').getByRole('button', { name: /^(Copy|Copied)$/ }).click();
      await checkExample(page, text);
    }
  };
  await checkExamples();
  await page.getByTestId('mint-agent-token').click();
  await expect(page.getByText('Synthetic mint failure', { exact: true })).toBeVisible();
  await page.getByTestId('mint-agent-token').click();
  await expect(page.getByText('Agent token', { exact: true })).toBeVisible();
  await checkExamples();
  expect(attempts).toBe(2);
});

test('Agent session copies a placeholder command while dedicated credential controls retain the token', async ({ page }) => {
  await seedSession(page, agent);
  await page.goto('/?local=1');
  const screen = page.getByTestId('agent-session');
  await expect(screen).toBeVisible();
  const example = screen.locator('pre');
  const text = (await example.textContent())!;
  const copyExample = example.locator('..').getByRole('button', { name: /^(Copy|Copied)$/ });
  await copyExample.click();
  await checkExample(page, text);

  const field = screen.getByText('Agent proxy token', { exact: true }).locator('..');
  await expect(field.locator('code')).not.toHaveText(agent);
  await field.getByRole('button', { name: 'Reveal', exact: true }).click();
  await expect(field.locator('code')).toHaveText(agent);
  await field.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(agent);
  await field.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(field.locator('code')).not.toHaveText(agent);
  await screen.getByTestId('agent-session-copy').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(agent);

  await copyExample.click();
  await checkExample(page, text);
});
