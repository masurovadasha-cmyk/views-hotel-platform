import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const origin='https://appassets.androidplatform.net';
const prefix='/views-hotel-platform/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
const apiRequests=[];
const viewportChecks=[];
const imageChecks=[];
const marketChecks=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{
  const url=new URL(request.url());
  if(/\/(api|v1)(\/|$)/.test(url.pathname))apiRequests.push(url.pathname);
});
await page.route(origin+'/**',async route=>{
  const url=new URL(route.request().url());
  const relative=url.pathname.startsWith(prefix)?url.pathname.slice(prefix.length):null;
  if(relative===null||relative.split('/').includes('..'))return route.fulfill({status:404,body:''});
  const filename=path.resolve('dist',relative||'index.html');
  try{await route.fulfill({path:filename});}catch{await route.fulfill({status:404,body:''});}
});
async function settle(){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function checkWidth(label){
  await settle();
  const measurement=await page.evaluate(()=>({
    viewport:innerWidth,
    documentWidth:document.documentElement.scrollWidth,
    bodyWidth:document.body.scrollWidth
  }));
  viewportChecks.push({label,...measurement});
  assert.ok(measurement.documentWidth<=measurement.viewport+1,label+' document overflow: '+JSON.stringify(measurement));
  assert.ok(measurement.bodyWidth<=measurement.viewport+1,label+' body overflow: '+JSON.stringify(measurement));
}
async function capture(filename){
  const images=await page.evaluate(async()=>{
    const list=Array.from(document.images);
    list.forEach(image=>{image.loading='eager';});
    await Promise.race([
      Promise.all(list.map(image=>image.decode().catch(()=>undefined))),
      new Promise(resolve=>setTimeout(resolve,8000))
    ]);
    return {total:list.length,loaded:list.filter(image=>image.complete&&image.naturalWidth>0).length};
  });
  imageChecks.push({filename,...images});
  await settle();
  await page.screenshot({path:'review-output/'+filename,fullPage:true});
}
await fs.mkdir('review-output',{recursive:true});
let failure=null;
try{
  await page.goto(origin+prefix,{waitUntil:'networkidle'});
  await page.getByText('VIEWS',{exact:true}).first().waitFor();
  await page.getByText('Static staging demo',{exact:true}).waitFor();
  await page.locator('.apartmentCard').first().getByRole('button',{name:'View',exact:true}).click();
  await page.locator('.apartmentGallery').waitFor();
  assert.ok((await page.locator('.galleryThumbs button').count())>=5,'Apartment gallery must expose at least 5 real listing photos');
  await page.locator('.galleryThumbs button').nth(1).click();
  assert.equal(await page.locator('.galleryCounter').innerText(),'2 / 5','Apartment thumbnail navigation must update the gallery');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await checkWidth('guest-desktop-1440');
  await capture('guest-desktop.png');

  await page.getByRole('button',{name:'V-Market',exact:true}).click();
  await page.getByRole('heading',{name:'Мини-маркет в номер',exact:true}).waitFor();
  assert.equal(await page.locator('.marketCard').count()>=100,true,'Market must render at least 100 SKU cards');
  assert.equal(await page.locator('.marketCard .productPhoto img').count()>=100,true,'Every visible market SKU must render a product photo element');
  await page.locator('.marketPhotoButton').first().click();
  await page.locator('.marketPhotoModal').waitFor();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Добавить',exact:true}).first().click();
  await page.getByRole('button',{name:/Корзина/}).click();
  assert.equal(await page.locator('.cartLines article').count(),1,'Cart should contain added SKU');
  const totalBeforeReload=await page.locator('.marketTotals strong').innerText();
  marketChecks.push({name:'add-to-cart',passed:true,totalBeforeReload});

  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'V-Market',exact:true}).click();
  await page.getByRole('button',{name:/Корзина/}).click();
  assert.equal(await page.locator('.cartLines article').count(),1,'Cart must persist after reload');
  marketChecks.push({name:'cart-persistence',passed:true});

  await page.getByRole('button',{name:'Заказать демо',exact:true}).click();
  await page.getByText('Демо-заказ создан и появился в Staff CRM.',{exact:true}).waitFor();
  assert.equal(await page.locator('.orderCards>article').count(),1,'Guest order history must contain created order');
  marketChecks.push({name:'demo-checkout',passed:true});

  await page.locator('.marketTabs').getByRole('button',{name:'Staff CRM',exact:true}).click();
  await page.getByRole('heading',{name:'Market Orders',exact:true}).waitFor();
  assert.equal(await page.locator('.staffOrders article').count(),1,'Staff CRM must see same order');
  await page.locator('.staffOrders').getByRole('button',{name:'Start picking',exact:true}).click();
  await page.locator('.staffOrders').getByRole('button',{name:'Packed',exact:true}).click();
  await page.locator('.staffOrders').getByRole('button',{name:'Out for delivery',exact:true}).click();
  await page.locator('.staffOrders').getByRole('button',{name:'Delivered',exact:true}).click();
  await page.getByText('delivered',{exact:true}).first().waitFor();
  assert.ok((await page.locator('.ledgerRows article').count())>=2,'Inventory ledger should include reservation and sale movement');
  marketChecks.push({name:'staff-fulfilment-and-ledger',passed:true});
  await checkWidth('market-desktop-1440');
  await capture('market-desktop.png');

  await page.getByRole('button',{name:'Guest App',exact:true}).click();
  await page.getByRole('button',{name:'Staff CRM',exact:true}).click();
  await page.getByRole('button',{name:'Guest App',exact:true}).waitFor();
  await checkWidth('staff-desktop-1440');
  await capture('staff-desktop.png');
  await page.getByRole('button',{name:'Guest App',exact:true}).click();

  for(const width of [360,390,768]){
    await page.setViewportSize({width,height:844});
    await checkWidth('guest-'+width);
  }
  await page.setViewportSize({width:390,height:844});
  await capture('guest-mobile.png');
  await page.getByRole('button',{name:'V-Market',exact:true}).click();
  await checkWidth('market-mobile-390');
  await capture('market-mobile.png');
  await page.getByRole('button',{name:'Dark',exact:true}).click();
  await page.getByRole('button',{name:'Light',exact:true}).waitFor();
  await checkWidth('market-dark-390');
  await capture('market-mobile-dark.png');
  await page.getByRole('button',{name:'Light',exact:true}).click();
  await page.getByRole('button',{name:'Staff CRM',exact:true}).first().click();
  await page.getByRole('button',{name:'Guest App',exact:true}).waitFor();
  await checkWidth('staff-mobile-390');
  await capture('staff-mobile.png');

  assert.deepEqual(errors,[],'Browser JavaScript errors');
  assert.deepEqual(apiRequests,[],'Review build must not call live APIs');
}catch(error){failure=String(error.message||error);}
const report={mode:'static-demo',passed:failure===null,
  guestRendered:failure===null,staffToggleWorks:failure===null,marketChecks,
  mobileViewport:{width:390,height:844},darkToggleWorks:failure===null,
  viewportChecks,imageChecks,pageErrors:errors,apiRequests,
  sourceCommit:process.env.GITHUB_SHA,failure,
  limitations:['Browser emulation, not a physical Android device','V-Market payment provider is DEMO only','Images may require external network access']};
await fs.writeFile('review-output/ui-smoke.json',JSON.stringify(report,null,2)+'\n');
await browser.close();
console.log(JSON.stringify(report));
if(failure)throw new Error(failure);
