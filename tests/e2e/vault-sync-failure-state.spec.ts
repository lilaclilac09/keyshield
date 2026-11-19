import { test, expect } from '@playwright/test';

const key = 'sk-proj-synthetic-sync-outage-only';
const exception = 'SYNTHETIC_PRIVATE_SYNC_EXCEPTION';
const saveError = 'Key NOT saved because vault sync could not be reached. Press Save again once vault sync is back.';
const deleteError = 'Entry NOT deleted and is still in the vault. Delete again after vault sync returns.';

for (const failure of ['503', 'network'] as const) {
  test(`manual save/delete recovery during ${failure} sync outage without retries or leaks`, async ({ page }) => {
    let down = true;
    let puts = 0;
    let polls = 0;
    let cipher: Record<string, unknown> | null = null;
    const bodies: Record<string, unknown>[] = [];
    await page.addInitScript(() => {
      localStorage.setItem('ks_token', 'synthetic-owner-sync-outage');
      localStorage.setItem('ks_wallet', 'synthetic-wallet-sync-outage');
    });
    await page.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === 'http://127.0.0.1:5173') return route.continue();
      if (url.pathname === '/health') return route.fulfill({ json: { ok: true } });
      if (url.pathname === '/manage/vault') {
        polls++;
        return route.fulfill({ json: { items: [] } });
      }
      if (url.pathname === '/auth/exchange') return route.fulfill({ json: { token: 'synthetic-sync-token', expiresAt: Date.now() + 600000 } });
      if (url.pathname.startsWith('/vault/')) {
        if (request.method() === 'GET') return cipher ? route.fulfill({ json: cipher }) : route.fulfill({ status: 404 });
        expect(request.method()).toBe('PUT');
        puts++;
        const body = request.postDataJSON();
        expect(Object.keys(body).sort()).toEqual(['ciphertext', 'iv', 'updatedAt', 'version']);
        expect(JSON.stringify(body)).not.toContain(key);
        if (down) return failure === 'network' ? route.abort('failed') : route.fulfill({ status: 503, json: { detail: `${exception} ${key}` } });
        bodies.push(body);
        cipher = body;
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ status: 503, json: { detail: 'Synthetic endpoint unavailable' } });
    });
    await page.goto('/?local=1');
    await page.evaluate(async () => {
      const path = '/lib/vault-session.ts';
      const { unlockVault } = await import(path);
      await unlockVault(new Uint8Array(32).fill(7).buffer, { synthetic: true });
    });
    await page.getByRole('button', { name: 'Vault', exact: true }).click();
    const draft = page.getByPlaceholder('sk-or-…  sk-proj-…  gsk_…  helius UUID…');
    const save = page.getByRole('button', { name: 'Save', exact: true });
    const cards = page.locator('div.group').filter({ has: page.getByRole('heading', { name: /OpenAI/ }) });
    const privateDom = async () => {
      const nonDraftText = await page.evaluate(() => {
        const copy = document.body.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('textarea, input').forEach(node => node.remove());
        return copy.textContent || '';
      });
      expect(nonDraftText).not.toContain(key);
      await expect(page.locator('body')).not.toContainText(exception);
      await expect(page.locator('body')).not.toContainText('/vault/');
      await expect(page.getByText(/API online ·/).first()).toBeVisible();
    };
    const waitForPollsWithoutRetry = async () => {
      const before = polls;
      const attempts = puts;
      await page.waitForTimeout(6500);
      expect(polls).toBeGreaterThanOrEqual(before + 2);
      expect(puts).toBe(attempts);
      await expect(page.getByText('Vault sync: last change not saved', { exact: true })).toBeVisible();
      await privateDom();
    };
    await draft.fill(key);
    await save.click();
    await expect(page.getByText(saveError, { exact: true })).toBeVisible();
    await expect(cards).toHaveCount(0);
    await expect(draft).toHaveValue(key);
    expect(puts).toBe(1);
    await waitForPollsWithoutRetry();
    await expect(page.getByText(saveError, { exact: true })).toBeVisible();
    down = false;
    await save.click();
    await expect(cards).toHaveCount(1);
    await expect(page.getByText(saveError, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Vault sync: last change saved', { exact: true })).toBeVisible();
    await expect(draft).toHaveValue('');
    expect(puts).toBe(2);
    down = true;
    const remove = cards.getByTitle('Delete (click twice)', { exact: true });
    await remove.click();
    await cards.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByText(deleteError, { exact: true })).toBeVisible();
    await expect(cards).toHaveCount(1);
    expect(puts).toBe(3);
    await waitForPollsWithoutRetry();
    await expect(page.getByText(deleteError, { exact: true })).toBeVisible();
    if (failure === '503') {
      await page.getByRole('button', { name: 'Dismiss vault sync error', exact: true }).click();
      await expect(page.getByText(deleteError, { exact: true })).toHaveCount(0);
    }
    down = false;
    await remove.click();
    await cards.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(cards).toHaveCount(0);
    await expect(page.getByText(deleteError, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Vault sync: last change saved', { exact: true })).toBeVisible();
    expect(puts).toBe(4);
    expect(bodies).toHaveLength(2);
    await privateDom();
  });
}
