const { test, expect } = require("@playwright/test");
async function boot(page, old) {
  if (old)
    await page.addInitScript((x) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("palletAccu", JSON.stringify(x));
        sessionStorage.setItem("seeded", "1");
      }
    }, old);
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await expect(page.locator("#currentPal")).toHaveText("1");
  await page.locator("#focusBtn").click();
}
async function scan(page, raw) {
  await page.locator("#scan").fill(raw);
  await page.locator("#scan").press("Enter");
}
async function state(page) {
  return page.evaluate(() => PalletApp.getState());
}
async function mixed(page) {
  await page.locator("#mixedBtn").click();
  await page.locator(".itemName").fill("610439P");
  await page.locator(".itemQty").fill("2000");
  await page.locator("#addRow").click();
  await page.locator(".itemName").nth(1).fill("634527");
  await page.locator(".itemQty").nth(1).fill("2000");
  for (const x of await page.locator(".unknownCheck:visible").all())
    await x.check();
  await page.locator("#entryRaw").fill("C720148Q4000S260709A3064");
  await page.locator("#reviewed").check();
  await page.locator("#entrySave").click();
}
test("normal continuous scan, actual quantities immutable, same LOT review and restore", async ({
  page,
}) => {
  await boot(page);
  await scan(page, "P634527Q2000SLOT1");
  await expect(page.locator("#status")).toContainText("저장 완료");
  await expect(page.locator("#scan")).toBeFocused();
  await scan(page, "P634527Q3000SLOT2");
  let s = await state(page);
  expect(s.boxes.map((b) => b.items[0].qty)).toEqual([2000, 3000]);
  await scan(page, "P634527Q1000SLOT1");
  await expect(page.locator("#duplicate")).toBeVisible();
  expect((await state(page)).boxes).toHaveLength(2);
  await page.locator("#duplicateAccept").click();
  expect((await state(page)).boxes).toHaveLength(3);
  expect(await page.evaluate(() => PalletApp.totals().parts[0].normal)).toBe(
    6000,
  );
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await state(page)).boxes.map((b) => b.items[0].qty)).toEqual([
    2000, 3000, 1000,
  ]);
  page.once("dialog", (d) => d.accept("5000"));
  await page.locator("[data-default]").first().click();
  expect((await state(page)).boxes.map((b) => b.items[0].qty)).toEqual([
    2000, 3000, 1000,
  ]);
});
test("mixed 2 items 4000 EA one physical box; full undo leaves unrelated box", async ({
  page,
}) => {
  await boot(page);
  await scan(page, "P634527Q300SOTHER");
  await mixed(page);
  let s = await state(page);
  expect(s.boxes).toHaveLength(2);
  expect(s.boxes[1].items.map((r) => r.qty)).toEqual([2000, 2000]);
  expect(s.boxes[1].type).toBe("mixed");
  const sheets = await page.evaluate(() => PalletApp.exportSheets());
  expect(sheets["파렛트별 박스"][1].slice(1, 4)).toEqual([2, 1, 1]);
  expect(
    sheets["품목별 총수량"].find((r) => r[0] === "610439P").slice(1, 4),
  ).toEqual([2000, 0, 2000]);
  expect(
    sheets["품목별 총수량"].find((r) => r[0] === "MG634527").slice(1, 4),
  ).toEqual([2300, 300, 2000]);
  await expect(page.locator("#partTbl")).toContainText("혼합");
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await state(page)).boxes).toHaveLength(2);
  page.once("dialog", (d) => d.accept());
  await page.locator("#undoBtn").click();
  s = await state(page);
  expect(s.boxes).toHaveLength(1);
  expect(s.boxes[0].items[0].qty).toBe(300);
});
test("CQS is never assigned as a part or total quantity", async ({ page }) => {
  await boot(page);
  await scan(page, "C720148Q4000S260709A3064");
  await expect(page.locator("#entryTitle")).toHaveText("KET 낱개·혼합박스");
  await expect(page.locator(".itemName")).toHaveValue("");
  await expect(page.locator(".itemQty")).toHaveValue("");
  expect((await state(page)).boxes).toHaveLength(0);
  await expect(page.locator("#rawReadout")).toContainText("C720148");
});
test("validation, master substring search, focus and original raw", async ({
  page,
}) => {
  await boot(page);
  await page.locator("#mixedBtn").click();
  await page.locator(".itemName").fill("610439");
  await expect(page.locator(".candidates")).toContainText("610439P");
  await page
    .locator(".candidates button")
    .filter({ hasText: "610439P" })
    .first()
    .click();
  for (const bad of [
    "",
    "0",
    "-1",
    "1.5",
    "2e3",
    "1,000",
    "9007199254740992",
  ]) {
    await page.locator(".itemQty").fill(bad);
    await page.locator("#reviewed").check();
    await page.locator("#entrySave").click();
    expect((await state(page)).boxes).toHaveLength(0);
  }
  await page.locator(".itemQty").fill("2000");
  await expect(page.locator(".itemQty")).toBeFocused();
  await page.locator("#entryCancel").click();
  await expect(page.locator("#scan")).toBeFocused();
  await page.locator("#palInput").fill("2");
  await page.locator("#palApply").click();
  await expect(page.locator("#scan")).toBeFocused();
  await scan(page, "  P634527Q2000SRAW  ");
  expect((await state(page)).boxes[0].raw).toBe("  P634527Q2000SRAW  ");
});
test("legacy exact backup, unverified rows separate, truncated feed never invents boxes", async ({
  page,
}) => {
  const old = {
    pal: "1",
    items: {
      a: { pal: "1", name: "610439P", boxes: 3, per: 2000, loose: 500 },
    },
    learned: {},
    seen: { "634527|OLD": { pal: "1" } },
    feed: [],
    pending: [{ pal: "1", raw: "pending" }],
  };
  await boot(page, old);
  let s = await state(page);
  expect(s.boxes).toHaveLength(0);
  expect(s.legacy.source).toEqual(old);
  expect(s.legacy.rows[0].displayQty).toBe(6500);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("palletAccu.backup.before-v2"),
    ),
  ).toBe(JSON.stringify(old));
  await scan(page, "P634527Q1000SOLD");
  await expect(page.locator("#duplicate")).toBeVisible();
  await page.locator("#duplicateAccept").click();
  await page.reload({waitUntil:'domcontentloaded'});
  s = await state(page);
  expect(s.legacy.source).toEqual(old);
  expect(s.boxes).toHaveLength(1);
  expect(
    await page.evaluate(() =>
      PalletApp.exportSheets()["파렛트별 박스"][1].slice(1),
    ),
  ).toEqual([1, 1, 0, 3]);
});
test("write failure never shows saved or mutates the ledger", async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await scan(page, "P634527Q2000SFAIL");
  expect((await state(page)).boxes).toHaveLength(0);
  await expect(page.locator("#status")).toContainText("저장 실패");
});
test("OCR parser processes both column pairs, missing quantity stays unregistrable; QR supported", async ({
  page,
}) => {
  await boot(page);
  const result = await page.evaluate(() => ({
    left: PalletApp.parseOCR("610439P 2,000 634527 2,000\n999999X", "좌"),
    right: PalletApp.parseOCR("634527 2000", "우"),
  }));
  expect(result.left.map((r) => r.qty)).toEqual(["2000", "2000", ""]);
  expect(result.right[0].name).toBe("MG634527");
  expect(
    await page.evaluate(() => {
      window.Html5QrcodeSupportedFormats = { QR_CODE: 0, CODE_128: 1 };
      return PalletApp.fmts();
    }),
  ).toContain(0);
});
test("JSON download, actual XLSX file values, export agrees with screen", async ({
  page,
}) => {
  await boot(page);
  await mixed(page);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#backupBtn").click();
  const download = await downloadPromise;
  const fs = require("node:fs");
  const payload = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  expect(payload.state.boxes[0].items).toHaveLength(2);
  const expected = await page.evaluate(() => PalletApp.exportSheets());
  await page.route("**/xlsx@0.18.5/**", (route) =>
    route.fulfill({
      path: require.resolve("xlsx/dist/xlsx.full.min.js"),
      contentType: "application/javascript",
    }),
  );
  const xp = page.waitForEvent("download");
  await page.locator("#xlsxBtn").click();
  const xd = await xp;
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(await xd.path());
  for (const [name, rows] of Object.entries(expected))
    expect(
      XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }),
    ).toEqual(rows);
  await expect(page.locator("#partCount")).toContainText("실물 1박스");
});
test("corrupt existing v2 blocks writes and preserves bytes", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("palletAccu.v2", "{invalid"),
  );
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await scan(page, "P634527Q2000SBLOCK");
  await expect(page.locator("#status")).toContainText("저장 차단");
  expect(await page.evaluate(() => localStorage.getItem("palletAccu.v2"))).toBe(
    "{invalid",
  );
});
test("same raw requires explicit decision and cancel does not save", async ({
  page,
}) => {
  await boot(page);
  await scan(page, "P634527Q2000SREPEAT");
  await scan(page, "P634527Q2000SREPEAT");
  await page.locator("#duplicateCancel").click();
  expect((await state(page)).boxes).toHaveLength(1);
  await expect(page.locator("#scan")).toBeFocused();
});
test("multi-tab changes block stale overwrite", async ({ page, context }) => {
  await boot(page);
  const second = await context.newPage();
  await second.goto('/', {waitUntil:'domcontentloaded'});
  await scan(page, "P634527Q2000STAB");
  await scan(second, "P634527Q2000SSTALE");
  await expect(second.locator("#status")).toContainText("저장 차단");
  await second.reload({waitUntil:'domcontentloaded'});
  expect((await state(second)).boxes).toHaveLength(1);
});
test("backup restore restores boxes, escaped names do not inject HTML", async ({
  page,
}) => {
  await boot(page);
  await mixed(page);
  const data = await state(page);
  data.boxes[0].items[0].name = "<img src=x onerror=alert(1)>";
  page.on("dialog", (d) => d.accept());
  await page
    .locator("#restoreIn")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "pallet-ledger-backup", state: data }),
      ),
    });
  await expect(page.locator("#status")).toContainText("복원 완료");
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await state(page)).boxes).toHaveLength(1);
  expect(await page.locator("#partTbl img").count()).toBe(0);
  await expect(page.locator("#partTbl")).toContainText("<img src=x");
});
test("camera repeat-frame lock is separate from physical duplicate decision", async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    window.Html5QrcodeSupportedFormats = { QR_CODE: 0, CODE_128: 1 };
    window.Html5Qrcode = class {
      async start(c, o, cb) {
        window.testCameraCallback = cb;
      }
      async stop() {}
      async clear() {}
    };
  });
  await page.locator("#camBtn").click();
  await page.evaluate(() => {
    testCameraCallback("P634527Q2000SCAM");
    testCameraCallback("P634527Q2000SCAM");
    testCameraCallback("P634527Q2000SOTHER");
  });
  expect((await state(page)).boxes).toHaveLength(1);
  await page.locator("#camNext").click();
  await page.evaluate(() => testCameraCallback("P634527Q2000SCAM"));
  await expect(page.locator("#duplicate")).toBeVisible();
  await page.locator("#duplicateAccept").click();
  expect((await state(page)).boxes).toHaveLength(2);
});
test("610439P never silently becomes MG610439, including old learned mappings", async ({
  page,
}) => {
  await boot(page, { pal: "1", items: {}, learned: { "610439P": "MG610439" } });
  await scan(page, "P610439PQ2000SUNCLEAR");
  await expect(page.locator("#entry")).toBeVisible();
  await expect(page.locator(".itemName")).toHaveValue("610439P");
  await expect(page.locator(".itemState")).toContainText("확인 필요");
  expect((await state(page)).boxes).toHaveLength(0);
});
test("barcode without quantity requires actual-label review despite remembered default", async ({
  page,
}) => {
  await boot(page);
  await scan(page, "P634527Q2000SFIRST");
  await scan(page, "634527");
  await expect(page.locator("#entry")).toBeVisible();
  expect((await state(page)).boxes).toHaveLength(1);
  await page.locator(".itemQty").fill("3000");
  await page.locator("#reviewed").check();
  await page.locator("#entrySave").click();
  expect((await state(page)).boxes.map((b) => b.items[0].qty)).toEqual([
    2000, 3000,
  ]);
});
test("only a verified unique-box rule hard-blocks repeats", async ({
  page,
}) => {
  await boot(page);
  const out = await page.evaluate(() => {
    const b = PalletApp.makeBox("normal", "1", "", [{ name: "test", qty: 1 }], {
      uniqueKey: "vendor:serial:1",
      uniqueRuleVerified: true,
    });
    const a = PalletApp.submitBox(b);
    const c = PalletApp.submitBox({ ...b, id: "other" });
    return { a, c, length: PalletApp.getState().boxes.length };
  });
  expect(out).toEqual({ a: true, c: false, length: 1 });
  await expect(page.locator("#status")).toContainText("중복 차단");
});
