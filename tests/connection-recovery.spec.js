const { test, expect } = require('@playwright/test');

const original = {
  pal: '1',
  learned: { 'JST-USER-001': 'MG634527', 'CUSTOM-002': '사용자 등록 JST 품명', '610439P': 'MG610439' },
  items: { old: { pal:'1', name:'MG634527', per:2000, boxes:3, loose:0 } },
  seen:{}, pending:[], feed:[]
};
async function seed(page, upgraded=false) {
  await page.addInitScript(({old,upgraded}) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.setItem('palletAccu', JSON.stringify(old));
    if (upgraded) localStorage.setItem('palletAccu.v2', JSON.stringify({
      schema:2, revision:9, pal:'1', boxes:[{id:'existing',pal:'1',type:'normal',raw:'new',at:'2026-10-12',items:[{name:'keep',qty:25}]}],
      learned:{'JST-USER-001':'새 버전에서 수정한 품명'}, defaults:{'MG634527':3000}, recent:[], pending:[],
      legacy:{source:old,rows:[{pal:'1',name:'MG634527',boxes:3,per:2000,loose:0,displayQty:6000}]}
    }));
  }, {old:original,upgraded});
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await page.locator('#focusBtn').click();
}
test('restore previously connected barcode aliases, including non-master custom names, without adding boxes',async({page})=>{
  await seed(page);
  let s=await page.evaluate(()=>PalletApp.getState());
  expect(s.learned).toEqual(original.learned);
  expect(s.boxes).toHaveLength(0);
  expect(s.defaults.MG634527).toBe(2000);
  expect(s.legacy.source).toEqual(original);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('palletAccu')))).toEqual(original);
  await page.locator('#connectionsPanel summary').click();
  await expect(page.locator('#connectionRecovery')).toContainText('3건 복구');
  await expect(page.locator('#connectionView')).toContainText('JST-USER-001');
  await page.locator('#scan').fill('JST-USER-001/2400/LOT-A');await page.locator('#scan').press('Enter');
  await expect(page.locator('#status')).toContainText('저장 완료');
  await page.keyboard.type('CUSTOM-002/1700/LOT-B');await page.keyboard.press('Enter');
  s=await page.evaluate(()=>PalletApp.getState());
  expect(s.boxes.map(b=>[b.items[0].name,b.items[0].qty])).toEqual([['MG634527',2400],['사용자 등록 JST 품명',1700]]);
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await page.evaluate(()=>PalletApp.getState())).boxes).toHaveLength(2);
});
test('repair an already migrated v2 without overwriting newer connections, defaults or ledger',async({page})=>{
  await seed(page,true);
  const s=await page.evaluate(()=>PalletApp.getState());
  expect(s.learned['JST-USER-001']).toBe('새 버전에서 수정한 품명');
  expect(s.learned['CUSTOM-002']).toBe('사용자 등록 JST 품명');
  expect(s.defaults.MG634527).toBe(3000);
  expect(s.boxes).toHaveLength(1);expect(s.boxes[0].items[0].qty).toBe(25);
  const rev=s.revision;
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await page.evaluate(()=>PalletApp.getState())).revision).toBe(rev);
});
test('keep risky partial matches visible as restored connections without auto-registering wrong part',async({page})=>{
  await seed(page);
  await page.locator('#scan').fill('P610439PQ2000SLOT');await page.locator('#scan').press('Enter');
  await expect(page.locator('#connectionNotice')).toContainText('610439P → MG610439');
  await expect(page.locator('.itemName')).toHaveValue('610439P');
  expect((await page.evaluate(()=>PalletApp.getState())).boxes).toHaveLength(0);
  await page.locator('.unknownCheck').check();await page.locator('#reviewed').check();await page.locator('#entrySave').click();
  const s=await page.evaluate(()=>PalletApp.getState());
  expect(s.learned['610439P']).toBe('610439P');
  expect(s.connectionReview['610439P']).toBeUndefined();
});
test('recovery write failure preserves both old and migrated records',async({page})=>{
  await page.addInitScript(()=>{const real=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='palletAccu.v2'&&localStorage.getItem(k))throw Error('quota');return real.call(this,k,v);};});
  await seed(page);
  const s=await page.evaluate(()=>PalletApp.getState());
  expect(s.learned).toEqual({});expect(s.legacy.source).toEqual(original);
  await expect(page.locator('#storageAlert')).toContainText('복구 저장에 실패');
});
