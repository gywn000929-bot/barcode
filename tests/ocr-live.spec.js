const { test, expect } = require("@playwright/test");
test("real browser OCR of a synthetic two-column label, candidates only, photo persistence", async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  test.skip(
    !process.env.LIVE_OCR,
    "Opt-in real CDN/worker integration, not a real shipping label accuracy test",
  );
  await page.goto('/', {waitUntil:'domcontentloaded'});
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1400;
    c.height = 440;
    const x = c.getContext("2d");
    x.fillStyle = "white";
    x.fillRect(0, 0, 1400, 440);
    x.fillStyle = "black";
    x.font = "bold 48px Arial";
    x.fillText("610439P  2,000", 50, 130);
    x.fillText("634527  2,000", 760, 130);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#mixedBtn").click();
  await page
    .locator("#labelFile")
    .setInputFiles({
      name: "synthetic-two-columns.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(page.locator("#labelPreview")).toBeVisible();
  await page.locator("#ocrBtn").click();
  await expect(page.locator("#ocrStatus")).toContainText(
    "候補".replace("候補", "후보"),
    { timeout: 150000 },
  );
  expect(await page.evaluate(() => PalletApp.getState().boxes.length)).toBe(0);
  const rows = await page
    .locator(".itemName")
    .evaluateAll((nodes) => nodes.map((n) => n.value));
  expect(rows).toContain("610439P");
  expect(rows).toContain("MG634527");
  expect(
    await page
      .locator(".itemQty")
      .evaluateAll((nodes) => nodes.map((n) => n.value)),
  ).toEqual(["2000", "2000"]);
  await page.screenshot({
    path: testInfo.outputPath("mixed-ocr.png"),
    fullPage: true,
  });
  for (const el of await page.locator(".unknownCheck:visible").all())
    await el.check();
  await page.locator("#reviewed").check();
  await page.locator("#entrySave").click();
  await page.reload({waitUntil:'domcontentloaded'});
  expect(
    await page.evaluate(() => PalletApp.getState().boxes[0].photo),
  ).toMatch(/^data:image\/jpeg;base64,/);
});
