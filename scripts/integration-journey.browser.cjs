'use strict';
const durable=require('./demo-market-storage-browser-helper.cjs');
// Cross-feature regression, complementary to individual calendar/market proofs.
// Serve only a built static demo; fail on any network mutation or external request.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const {setStayRange}=require('./stay-calendar-browser-helper.cjs');
const guest=require('../src/features/guest/guest-translations.json');
const market=require('../src/features/guest/market-translations.json');
const root=path.resolve(process.env.VIEWS_JOURNEY_DIST||'dist'),release=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));
const requests=[],errors=[],checks=[];
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end();}
 const target=file===root?path.join(root,'index.html'):file;
 if(!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.end(fs.readFileSync(target));
});
const translated=(catalog,locale,key)=>catalog[key]?.[locale]||key;
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const executablePath=process.env.VIEWS_BROWSER_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  browser=await chromium.launch({headless:true,...executablePath?{executablePath}:{}});
  for(const locale of ['en','ru','uz']){
   const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles'});
   const page=await context.newPage();page.setDefaultTimeout(10000);
   await page.clock.setFixedTime(new Date('2026-10-31T19:30:00Z'));
   await page.addInitScript(l=>{localStorage.setItem('views.guest.locale',l);localStorage.setItem('views.staff.locale','en');},locale);
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin||request.method()!=='GET'||/^\/(api|local-api|guest-api)\//.test(url.pathname)){requests.push(request.method()+' '+url.pathname);return route.abort();}
    return route.continue();
   });
   const gt=k=>translated(guest,locale,k),mt=k=>translated(market,locale,k);
   const search=page.locator('.searchBox'),range=()=>search.getByTestId('stay-date-range').getByRole('button');
   const shop=page.getByTestId('guest-market'),marketButton=k=>shop.getByRole('button',{name:mt(k),exact:true});
   const nav=page.locator('.guestNav');
   async function marketTab(){await nav.getByRole('button',{name:gt('Services'),exact:true}).click();await durable.ready(page);await page.getByRole('button',{name:/V Market/}).first().click();await durable.ready(page);await shop.waitFor();await durable.ready(page);}
   async function explore(){await nav.getByRole('button',{name:gt('Explore'),exact:true}).click();await durable.ready(page);await search.waitFor();}
   const stock=()=>shop.locator('[data-stock="sample-water"]').innerText();
   const demoState=()=>durable.state(page);
   await page.goto(origin+'/?api=demo');
   const photo=page.locator('.apartmentCard img').first();await photo.waitFor();
   await page.waitForFunction(()=>{const p=document.querySelector('.apartmentCard img');return p&&p.complete&&p.naturalWidth>0;});
   const photoSrc=await photo.getAttribute('src');
   await setStayRange(page,search,'2026-11-30','2026-12-02');
   // A changed draft closed by Back/Forward must not replace committed dates.
   await range().click();await durable.ready(page);const picker=page.getByTestId('stay-calendar');
   await picker.getByTestId('stay-calendar-reset').click();await durable.ready(page);await picker.locator('[data-date="2026-12-05"]').click();await durable.ready(page);
   await page.goBack();await picker.waitFor({state:'hidden'});assert.match(await range().innerText(),/2026-11-30.*2026-12-02/);
   await page.goForward();await picker.waitFor();assert.match(await picker.locator('.stayDateSummary').innerText(),/2026-11-30.*2026-12-02/);
   await picker.getByTestId('stay-calendar-cancel').click();await durable.ready(page);await page.waitForFunction(()=>!history.state?.viewsStayCalendar);
   await marketTab();await shop.getByRole('button',{name:mt('Add to list')+': '+mt('Still water'),exact:true}).click();await durable.ready(page);
   // Two Review invocations before rerender preserve one pending confirmation.
   await marketButton('Review demo order').evaluate(button=>{button.click();button.click();});await durable.ready(page);
   await shop.getByTestId('market-review').waitFor();assert.equal(await shop.getByRole('alert').count(),0);
   const pending=(await demoState()).pending;assert.equal(pending.id,'DEMO-1');assert.equal(await stock(),'10');
   await explore();assert.match(await range().innerText(),/2026-11-30.*2026-12-02/);
   await page.getByRole('button',{name:gt('Staff CRM'),exact:true}).click();await durable.ready(page);
   await page.setViewportSize({width:1440,height:1000});
   for(const role of ['front_desk','general_manager','super_admin']){
    await page.locator('.staffHead select').selectOption(role);
    await setStayRange(page,page.locator('.demoStayCalendar'),'2026-12-10','2026-12-12');
    assert.match(await page.locator('.demoStayCalendar').innerText(),/2026-12-10.*2026-12-12/);
   }
   await page.getByRole('button',{name:'Guest App',exact:true}).click();await durable.ready(page);
   // Guest stay must survive unmount without inheriting the staff date selection.
   assert.match(await range().innerText(),/2026-11-30.*2026-12-02/);
   assert.equal(await photo.getAttribute('src'),photoSrc);
   await marketTab();assert.deepEqual((await demoState()).pending,pending);
   await marketButton('Confirm demo order').evaluate(button=>{button.click();button.click();});await durable.ready(page);
   await shop.locator('[data-demo-order="DEMO-1"]').waitFor();assert.equal(await stock(),'9');assert.equal((await demoState()).orders.length,1);
   for(const width of [360,1440]){
    await page.setViewportSize({width,height:900});
    for(let theme=0;theme<2;theme++){await page.locator('[data-theme-toggle]').click();await durable.ready(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await stock(),'9');}
   }
   await page.reload();await search.waitFor();assert.match(await range().innerText(),/2026-11-30.*2026-12-02/);
   await marketTab();assert.equal(await stock(),'9');assert.equal((await demoState()).orders.length,1);
   await marketButton('Cancel demo order').click();await durable.ready(page);assert.equal(await stock(),'10');assert.equal((await demoState()).orders[0].status,'cancelled');
   await explore();await setStayRange(page,search,'','');await page.reload();assert.doesNotMatch(await range().innerText(),/2026-11-30/);
   await marketTab();assert.equal((await demoState()).orders[0].status,'cancelled');assert.equal(await stock(),'10');
   checks.push(locale+': saved stay/back-forward draft/market review/three staff roles/guest isolation/photos/double confirm/reload/cancel/reset/two themes/two widths');
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log(JSON.stringify({result:'pass',proof:'integrated_calendar_market_roles',release:{sourceCommit:release.sourceCommit,sourceDirty:release.sourceDirty,version:release.version},checks,pageErrors:errors,unexpectedRequests:requests,realPayments:false}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
