import { resolve } from 'node:path';
import { test, expect, installHarness, page, popup, secondOrigin, samples, output, networkRequests, openPopup, unlock, add, save, selection, state } from './harness';

installHarness({ nativeViewport: true, headless: false });

async function screenshot(name: string) {
  await popup.screenshot({ path: resolve(process.env.KEYSHIELD_REAL_SIZE_SCREENSHOTS || output, name), fullPage: false });
}

async function toolbarSize() {
  const width = await popup.locator('body').evaluate((body) => Math.ceil(body.getBoundingClientRect().width));
  expect(width).toBeLessThanOrEqual(800);
  await popup.setViewportSize({ width, height: 600 });
  expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await popup.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  console.log(`Toolbar content viewport: ${width}×600`);
}

async function scrollToActions() {
  await popup.mouse.move(180, 400);
  await popup.mouse.wheel(0, 900);
  await expect.poll(() => popup.evaluate(() => scrollY)).toBeGreaterThan(0);
}

async function tabFromTopTo(id: string) {
  await popup.locator('#passphrase').focus();
  await popup.evaluate(() => scrollTo(0, 0));
  for (let index = 0; index < 20; index++) {
    await popup.keyboard.press('Tab');
    if (await popup.evaluate(() => document.activeElement?.id) === id) break;
  }
  await expect(popup.locator(`#${id}`)).toBeFocused();
  await expect(popup.locator(`#${id}`)).toBeInViewport({ ratio: 1 });
}

test('KS-UI-001 real toolbar size: scroll and keyboard reach Fill; origin binding remains enforced', async () => {
  await openPopup();
  await unlock();
  await add();
  await save();
  await popup.close();
  await page.locator('input').fill('');
  await page.locator('input').focus();
  await openPopup();
  await toolbarSize();
  await screenshot('popup-top.png');
  await scrollToActions();
  await expect(popup.locator('#fill')).toBeInViewport({ ratio: 1 });
  await popup.locator('#fill').click();
  await expect(popup.locator('#status')).toContainText('Filled focused input');
  await expect(page.locator('input')).toHaveValue(samples[0].value);
  await screenshot('popup-fill-scrolled.png');
  await popup.close();
  await page.locator('input').fill('');
  await page.locator('input').focus();
  await openPopup();
  await toolbarSize();
  await tabFromTopTo('fill');
  await screenshot('popup-fill-tab.png');
  await popup.keyboard.press('Enter');
  await expect(popup.locator('#status')).toContainText('Filled focused input');
  await expect(page.locator('input')).toHaveValue(samples[0].value);
  await popup.close();
  await page.goto(`${secondOrigin}/input.html`);
  await page.locator('input').fill('');
  await page.locator('input').focus();
  await openPopup();
  await toolbarSize();
  await tabFromTopTo('fill');
  await popup.keyboard.press('Enter');
  await expect(popup.locator('#status')).toHaveText('Fill refused: this key belongs to another origin');
  await expect(page.locator('input')).toHaveValue('');
  await scrollToActions();
  await screenshot('popup-fill-other-origin.png');
  expect(JSON.stringify(networkRequests)).not.toContain('FAKE_KEYSHIELD_NOT_A_KEY::');
});

test('KS-UI-002 native confirmation size: Save and Cancel reachable by scroll and Tab; Enter saves', async () => {
  await openPopup();
  await unlock();
  await popup.close();
  await selection('input');
  const size = await popup.evaluate(async () => {
    const window = await chrome.windows.getCurrent();
    return { width: window.width, height: window.height, innerWidth, innerHeight };
  });
  expect(size).toMatchObject({ width: 410, height: 750 });
  expect(size.innerWidth).toBeLessThanOrEqual(size.width!);
  expect(size.innerHeight).toBeLessThanOrEqual(size.height!);
  expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await popup.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  console.log(`Confirmation outer: ${size.width}×${size.height}; content: ${size.innerWidth}×${size.innerHeight}`);
  await expect(popup.locator('.storage-note')).toContainText('Will save to: this device only');
  await screenshot('confirmation-top.png');
  await scrollToActions();
  await expect(popup.locator('#save')).toBeInViewport({ ratio: 1 });
  await expect(popup.locator('#cancel')).toBeInViewport({ ratio: 1 });
  await screenshot('confirmation-actions-scrolled.png');
  await popup.locator('#cancel').click();
  await expect(popup.locator('#status')).toHaveText('Cancelled — nothing saved');
  expect((await state()).entries).toEqual([]);
  await popup.close();
  await selection('input');
  await tabFromTopTo('cancel');
  await screenshot('confirmation-cancel-tab.png');
  await popup.keyboard.press('Shift+Tab');
  await expect(popup.locator('#save')).toBeFocused();
  await expect(popup.locator('#save')).toBeInViewport({ ratio: 1 });
  await screenshot('confirmation-save-tab.png');
  await popup.keyboard.press('Enter');
  await expect(popup.locator('#status')).toHaveText('Saved encrypted on this device');
  expect((await state()).entries.map((entry) => entry.value)).toEqual([samples[0].value]);
  expect(JSON.stringify(networkRequests)).not.toContain('FAKE_KEYSHIELD_NOT_A_KEY::');
});
