const { test, expect } = require('@playwright/test');

test('one start tap receives multiple HID keyboard streams, pallet Enter and popup close resume', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '스캔 시작', exact: true }).click();
  for (let i = 1; i <= 3; i++) {
    // No locator.fill/focus between scans: exercise the currently focused input.
    await page.keyboard.type(`P634527Q2000SHID${i}`);
    await page.keyboard.press(i === 2 ? 'Tab' : 'Enter');
  }
  expect(await page.evaluate(() => PalletApp.getState().boxes.length)).toBe(3);
  await expect(page.locator('#scan')).toBeFocused();
  await page.locator('#palInput').fill('2');
  await page.keyboard.press('Enter');
  await expect(page.locator('#scan')).toBeFocused();
  await page.keyboard.type('P634527Q3000SHID4');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => PalletApp.getState().boxes.at(-1).pal)).toBe('2');
  await page.locator('#mixedBtn').click();
  await page.locator('#entryCancel').click();
  await expect(page.locator('#scan')).toBeFocused();
  await page.keyboard.type('P634527Q1000SHID5');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => PalletApp.getState().boxes.length)).toBe(5);
  await page.getByRole('heading', { name: '파렛트 바코드 · 실물 검수' }).click();
  await expect(page.locator('#scan')).toBeFocused();
});

test('manual fields keep focus through recovery events and delayed popup callbacks', async ({ page }) => {
  await page.goto('/');
  await page.locator('#focusBtn').click();
  await page.locator('#mixedBtn').click();
  for (const field of ['.itemName', '.itemQty']) {
    await page.locator(field).fill(field === '.itemName' ? '634527' : '2000');
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(160); // exceeds both focus recovery and popup-close timers
    await expect(page.locator(field)).toBeFocused();
  }
  await expect(page.locator('#hidState')).toContainText('수동 입력');
  await page.evaluate(() => { document.querySelector('#entry').close(); document.querySelector('#palInput').focus(); });
  await page.waitForTimeout(160);
  await expect(page.locator('#palInput')).toBeFocused();
  await page.locator('#palApply').click();
  await expect(page.locator('#scan')).toBeFocused();
});

test('stop cancels recovery, restart resumes, reload requires a fresh user tap', async ({ page }) => {
  await page.goto('/');
  await page.locator('#focusBtn').click();
  await page.locator('#hidStop').click();
  await page.locator('#palInput').fill('3');
  await page.locator('#palApply').click();
  await page.waitForTimeout(160);
  await expect(page.locator('#scan')).not.toBeFocused();
  await expect(page.locator('#hidState')).toContainText('꺼짐');
  await page.locator('#focusBtn').click();
  await expect(page.locator('#scan')).toBeFocused();
  await page.reload();
  await expect(page.locator('#focusBtn')).toHaveText('스캔 시작');
  await expect(page.locator('#scan')).not.toBeFocused();
});
