const {test,expect}=require('@playwright/test');
test('legacy supplier fields remain suggestions when quantity meaning is ambiguous',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const p=await page.evaluate(()=>['634527//2000/LOT/','634527/LOT/2000/','634527@2,000EA@LINE@DATE','634527@1.5M@LINE@DATE','634527/LOT/2000/260709'].map(PalletApp.parseBarcode));
 expect(p[0]).toMatchObject({part:'634527',qty:2000});expect(p[1]).toMatchObject({qty:2000,review:true});expect(p[2]).toMatchObject({qty:2000,review:true});expect(p[3].qty).toBe(0);expect(p[4].qty).toBe(0);
});
test('old contained-code match is reviewable, then learned for next JST-style scan',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.locator('#focusBtn').click();
 await page.locator('#scan').fill('PREFIX634527/2000/LOT1');await page.locator('#scan').press('Enter');
 await expect(page.locator('#connectionNotice')).toContainText('부분 일치');
 expect((await page.evaluate(()=>PalletApp.getState())).boxes).toHaveLength(0);
 await page.locator('.candidates button').filter({hasText:'MG634527'}).click();
 await page.locator('#reviewed').check();await page.locator('#entrySave').click();
 await page.locator('#scan').fill('PREFIX634527/3000/LOT2');await page.locator('#scan').press('Enter');
 const s=await page.evaluate(()=>PalletApp.getState());expect(s.boxes.map(b=>b.items[0].qty)).toEqual([2000,3000]);
});
