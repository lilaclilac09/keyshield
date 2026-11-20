import type { Page } from '@playwright/test';
import { test, expect, installHarness, context, page, popup, origin, samples, networkRequests, output, openPopup, unlock, add, save, stored, state, selection } from './harness';

installHarness();

async function seedStorage(target: Page) {
  await target.evaluate(async () => {
    localStorage.setItem('tutorial-control', 'non-secret sentinel');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('tutorial-control', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('records', 'readwrite');
        transaction.objectStore('records').put('non-secret sentinel', 'control');
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      };
    });
  });
}

async function pageStorage(target: Page) {
  return target.evaluate(async () => {
    const databases: Record<string, unknown> = {};
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const stores: Record<string, unknown> = {};
        for (const name of Array.from(db.objectStoreNames)) {
          const store = db.transaction(name, 'readonly').objectStore(name);
          stores[name] = await Promise.all([store.getAllKeys(), store.getAll()].map((request) => new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          })));
        }
        databases[info.name] = stores;
      } finally { db.close(); }
    }
    return { localStorage: { ...localStorage }, indexedDB: databases };
  });
}

for (const method of ['selection', 'Add key']) {
  test(`KS-TUTORIAL ${method}: extension-only local integration`, async () => {
    let dashboard: Page;
    let before: unknown;
    await test.step('1. Build and load in a dedicated local test profile', async () => {
      expect(await stored()).toEqual({});
      expect(page.url()).toBe(`${origin}/input.html`);
      dashboard = await context.newPage();
      await dashboard.goto('https://dashboard.vault.test/empty.html');
      await seedStorage(page);
      await seedStorage(dashboard);
      before = [await pageStorage(page), await pageStorage(dashboard)];
      await page.bringToFront();
      if (process.env.KEYSHIELD_TUTORIAL_RECORD === '1') {
        console.log(`Recording profile/build root: ${output}; provider: ${origin}/input.html; dashboard mock: https://dashboard.vault.test/empty.html`);
        await page.pause();
      }
    });
    await test.step('2. Create and unlock the extension vault', async () => {
      await openPopup();
      await unlock();
      await popup.locator('#lock').click();
      await expect(popup.locator('#status')).toHaveText('Vault locked');
      await unlock();
      expect((await state()).entries).toEqual([]);
    });
    await test.step('3. Submit exactly one synthetic value', async () => {
      if (method === 'selection') {
        await popup.close();
        await selection('input');
      } else {
        await add(samples[0].value);
      }
      expect((await state()).pending.value).toBe(samples[0].value);
      expect((await state()).entries).toEqual([]);
    });
    await test.step('4. Review the masked confirmation and explicitly Save', async () => {
      await expect(popup.locator('#preview')).toHaveText('••••AAAA');
      await expect(popup.locator('#origin')).toHaveText(origin);
      await expect(popup.locator('#provider')).toHaveValue(samples[0].provider);
      await popup.locator('#label').fill('Tutorial synthetic key');
      await save();
      const data = await stored();
      expect(Object.keys(data).sort()).toEqual(['auditLog', 'vault']);
      expect(data.vault).toMatchObject({ version: 1, iterations: 310000 });
      expect(data.vault.iv).toHaveLength(12);
      expect(data.vault.ciphertext.length).toBeGreaterThan(16);
      expect(JSON.stringify(data)).not.toContain('FAKE_KEYSHIELD_NOT_A_KEY::');
      expect((await state()).entries.map((entry) => entry.value)).toEqual([samples[0].value]);
      const pages = [await pageStorage(page), await pageStorage(dashboard)];
      expect(pages).toEqual(before);
      expect(JSON.stringify({ pages, networkRequests })).not.toContain('FAKE_KEYSHIELD_NOT_A_KEY::');
    });
    await test.step('5. Fill a focused field on the bound origin', async () => {
      await popup.close();
      await page.locator('input').fill('');
      await page.locator('input').focus();
      await openPopup();
      await popup.locator('#fill').click();
      await expect(popup.locator('#status')).toContainText('Filled focused input');
      await expect(page.locator('input')).toHaveValue(samples[0].value);
      expect([await pageStorage(page), await pageStorage(dashboard)]).toEqual(before);
    });
    await test.step('6. Observe refusal on another origin', async () => {
      await popup.close();
      await page.goto('https://evil.test/input.html');
      await page.locator('input').fill('');
      await page.locator('input').focus();
      await openPopup();
      await popup.locator('#fill').click();
      await expect(popup.locator('#status')).toContainText('not a supported provider page');
      await expect(page.locator('input')).toHaveValue('');
    });
    await test.step('7. Lock the extension vault', async () => {
      await popup.locator('#lock').click();
      await expect(popup.locator('#status')).toHaveText('Vault locked');
      expect((await state()).entries).toBeNull();
      const result = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'LIST' }));
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Unlock') });
      expect(JSON.stringify({ data: await stored(), networkRequests })).not.toContain('FAKE_KEYSHIELD_NOT_A_KEY::');
    });
  });
}
