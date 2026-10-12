const { test, expect } = require('@playwright/test');

// Screenshot-derived fixtures, not a claim about the exact device output bytes.
test('Korean HID delimiter candidate requires confirmation and keeps original raw', async ({ page }) => {
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await page.locator('#focusBtn').click();
  const raw = 'ㅔ730695-3ㅃ24000ㄴ260908—9';
  await page.locator('#scan').fill(raw);
  await page.locator('#scan').press('Enter');
  await expect(page.locator('#entry')).toBeVisible();
  await expect(page.locator('.itemName')).toHaveValue('ST730695-3');
  await expect(page.locator('.itemQty')).toHaveValue('24000');
  await expect(page.locator('#inputCorrection')).toContainText('P730695-3Q24000S260908-9');
  await expect(page.locator('#entryRaw')).toHaveValue(raw);
  expect(await page.evaluate(() => PalletApp.getState().boxes.length)).toBe(0);
  await page.locator('#reviewed').check();
  await page.locator('#entrySave').click();
  const box = await page.evaluate(() => PalletApp.getState().boxes[0]);
  expect(box.raw).toBe(raw);
  expect(box.normalizedCandidate).toBe('P730695-3Q24000S260908-9');
  expect(box.items[0].qty).toBe(24000);
  await expect(page.locator('#scan')).toBeFocused();
  await page.keyboard.type('P730695-3Q24000S260908-9');
  await page.keyboard.press('Enter');
  await expect(page.locator('#duplicate')).toBeVisible();
});

test('limited keyboard recovery does not reinterpret mixed box or arbitrary Korean', async ({ page }) => {
  await page.goto('/', {waitUntil:'domcontentloaded'});
  const values = await page.evaluate(() => [
    'ㅖ730695-3ㅂ24000ㄴ260908-9',
    'P730695-3Q24000S260908—9',
    'ㅊ720148ㅃ4000ㄴ260709A3064',
    '한글품명24000',
    'ㅔ730695-3ㅃ24.5ㄴ260908-9'
  ].map(raw => PalletApp.parseBarcode(raw)));
  expect(values[0].correction).toBe('P730695-3Q24000S260908-9');
  expect(values[1].correction).toBe('P730695-3Q24000S260908-9');
  expect(values[2]).toMatchObject({ mixed: true, part: '', qty: 0 });
  expect(values[3]).toMatchObject({ part: '한글품명24000', qty: 0, format: 'TEXT' });
  expect(values[4].qty).toBe(0);
});
