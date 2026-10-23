'use strict';
// Shared guest/staff demo ledger proof. Static artifact only; network writes forbidden.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const {setStayRange}=require('./stay-calendar-browser-helper.cjs');
const source=path.resolve(process.env.VIEWS_JOURNEY_SOURCE||'.');
const guest=require(path.join(source,'src/features/guest/guest-translations.json'));
const staff=require(path.join(source,'src/features/local-core/staff-translations.json'));
const roleMessages=require(path.join(source,'src/features/staff-entry/staff-role-translations.json'));
const messages=require(path.join(source,'src/features/guest/market-translations.json'));
const root=path.resolve(process.env.VIEWS_JOURNEY_DIST||'dist');
const release=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));
const key='views.demo-market.v1',checks=[],errors=[],requests=[];
const legacy={version:1,sequence:1,cart:{},pending:null,orders:[{id:'DEMO-1',lines:{'sample-water':10},status:'reserved'}]};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 const target=file===root?path.join(root,'index.html'):file;
 if(!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'})[path.extname(target)]||'application/octet-stream');res.end(fs.readFileSync(target));
});
(async()=>{
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const executablePath=process.env.VIEWS_BROWSER_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  browser=await chromium.launch({headless:true,...executablePath?{executablePath}:{}});
  assert.equal(release.mode,'static-demo');
  for(const locale of ['en','ru','uz']){
   const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles'}),page=await context.newPage();page.setDefaultTimeout(10000);
   await page.clock.setFixedTime(new Date('2026-10-31T19:30:00Z'));
   await page.addInitScript(l=>{localStorage.setItem('views.guest.locale',l);localStorage.setItem('views.staff.locale',l);},locale);
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin||r.method()!=='GET'||/^\/(api|local-api|guest-api)\//.test(u.pathname)){requests.push(r.method()+' '+u.pathname);return route.abort();}return route.continue();});
   const tr=(catalog,k)=>catalog[k]?.[locale]||k,t=k=>tr(messages,k),gt=k=>tr(guest,k),st=k=>tr(staff,k);
   const shop=page.getByTestId('guest-market'),queue=page.getByTestId('demo-market-queue');
   const button=k=>shop.getByRole('button',{name:t(k),exact:true}),row=id=>queue.locator('[data-demo-staff-order="'+id+'"]');
   const state=()=>page.evaluate(k=>JSON.parse(sessionStorage.getItem(k)),key);
   const raw=()=>page.evaluate(k=>sessionStorage.getItem(k),key);
   async function guestMarket(){await page.getByRole('button',{name:/V Market/}).first().click();await shop.waitFor();}
   async function open(){await page.goto(origin+'/?api=demo');await guestMarket();}
   async function seed(value){await page.evaluate(({key,value})=>sessionStorage.setItem(key,JSON.stringify(value)),{key,value});await open();}
   async function staffQueue(){await page.getByRole('button',{name:gt('Staff CRM'),exact:true}).click();await page.getByTestId('demo-market-nav').click();await queue.waitFor();}
   async function guestReturn(){await page.getByRole('button',{name:st('Гостевое приложение'),exact:true}).click();await guestMarket();}
   await page.goto(origin+'/?api=demo');
   await setStayRange(page,page.locator('.searchBox'),'2026-11-30','2026-12-02');
   await guestMarket();await shop.getByRole('button',{name:t('Add to list')+': '+t('Still water'),exact:true}).click();
   await button('Review demo order').click();await button('Confirm demo order').click();
   await staffQueue();await row('DEMO-1').waitFor();assert.equal((await state()).orders[0].status,'reserved');
   await row('DEMO-1').getByTestId('demo-staff-complete').click();await page.getByTestId('demo-staff-back').click();assert.equal((await state()).orders[0].status,'reserved');
   // Changing role while a confirmation is open must revoke that confirmation.
   await row('DEMO-1').getByTestId('demo-staff-complete').click();await page.locator('.staffHead select').selectOption('cleaner');
   assert.equal(await page.getByTestId('demo-market-nav').count(),0);assert.equal(await page.getByTestId('demo-staff-confirm').count(),0);
   await page.locator('.staffHead select').selectOption('technician');assert.equal(await page.getByTestId('demo-market-nav').count(),0);
   await page.locator('.staffHead select').selectOption('front_desk');await page.getByTestId('demo-market-nav').click();await row('DEMO-1').getByTestId('demo-staff-complete').click();
   // Atomic write failure retains the reservation and permits a safe retry.
   const before=await raw();
   await page.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='views.demo-market.v1')throw Error('quota');return window.qaSetItem.call(this,k,v);};});
   await page.getByTestId('demo-staff-confirm').click();await queue.getByRole('alert').waitFor();assert.equal(await raw(),before);
   await page.evaluate(()=>{Storage.prototype.setItem=window.qaSetItem;});
   await page.getByTestId('demo-staff-confirm').evaluate(b=>{b.click();b.click();});assert.equal((await state()).orders[0].status,'completed');assert.equal((await state()).orders.length,1);
   await guestReturn();assert.equal(await shop.locator('[data-stock="sample-water"]').innerText(),'9');assert.equal(await button('Cancel demo order').count(),0);
   await page.locator('.guestNav').getByRole('button',{name:gt('Explore'),exact:true}).click();assert.match(await page.locator('.searchBox').getByTestId('stay-date-range').innerText(),/2026-11-30.*2026-12-02/);
   await open();assert.equal((await state()).orders[0].status,'completed');
   // Literal pre-upgrade state, replacement chain and in-progress edits survive role remounts.
   const chained={version:1,sequence:2,cart:{},pending:null,orders:[{id:'DEMO-2',lines:{'sample-water':2},status:'reserved',replacesOrderId:'DEMO-1'},{id:'DEMO-1',lines:{'sample-water':1},status:'cancelled',replacedByOrderId:'DEMO-2'}]};
   await seed(chained);await staffQueue();assert.equal(await queue.locator('[data-demo-staff-order]').count(),2);
   for(const role of ['concierge','super_admin','general_manager']){await page.locator('.staffHead select').selectOption(role);await page.getByTestId('demo-market-nav').click();assert.equal(await row('DEMO-2').getByTestId('demo-staff-complete').isEnabled(),true);assert.deepEqual(await state(),chained);}
   assert.equal(await row('DEMO-1').getByTestId('demo-staff-cancel').count(),0);
   await row('DEMO-2').getByTestId('demo-staff-cancel').click();await page.getByTestId('demo-staff-confirm').evaluate(b=>{b.click();b.click();});
   await guestReturn();assert.equal(await shop.locator('[data-stock="sample-water"]').innerText(),'10');assert.equal((await state()).orders.length,2);
   for(const extra of [
    {cart:{'sample-water':9},editingOrderId:'DEMO-1'},
    {sequence:2,cart:{'sample-water':9},editingOrderId:'DEMO-1',pending:{id:'DEMO-2',lines:{'sample-water':9},replacesOrderId:'DEMO-1'}},
    {sequence:2,cart:{'sample-tea':1},pending:{id:'DEMO-2',lines:{'sample-tea':1}}}
   ]){
    const saved={...legacy,...extra};await seed(saved);await staffQueue();
    for(const action of ['demo-staff-complete','demo-staff-cancel']){const b=row('DEMO-1').getByTestId(action);assert.ok(await b.count()===0||await b.isDisabled());}
    await guestReturn();assert.deepEqual(await state(),saved);
   }
   // Staff's stale visible confirmation must not resurrect an externally completed order.
   await seed(legacy);await staffQueue();await row('DEMO-1').getByTestId('demo-staff-cancel').click();
   const completed={...legacy,orders:[{...legacy.orders[0],status:'completed'}]};
   await page.evaluate(({key,value})=>sessionStorage.setItem(key,JSON.stringify(value)),{key,value:completed});
   await page.getByTestId('demo-staff-confirm').click();assert.deepEqual(await state(),completed);
   // Owner demo is read-only even with a still-actionable reserved order.
   await page.evaluate(({key,value})=>sessionStorage.setItem(key,JSON.stringify(value)),{key,value:legacy});
   await page.goto(origin+'/?api=demo&entry=staff&staffRole=owner');await page.getByRole('button',{name:tr(roleMessages,'Explore this role’s demo'),exact:true}).click();await page.getByTestId('demo-market-nav').click();await queue.waitFor();
   assert.equal(await queue.getByTestId('demo-staff-complete').count(),0);assert.equal(await queue.getByTestId('demo-staff-cancel').count(),0);assert.deepEqual(await state(),legacy);
   for(const width of [360,768,1440]){await page.setViewportSize({width,height:900});for(let n=0;n<2;n++){await page.locator('[data-theme-toggle]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}}
   // The delivered review bundle must not activate Core by query-string manipulation.
   for(const mode of ['live','guest-core','local-core']){await page.goto(origin+'/?api='+mode);assert.equal(await page.locator('[data-runtime]').getAttribute('data-runtime'),'static-demo');assert.deepEqual(await state(),legacy);}
   checks.push(locale+': guest-staff-ledger/confirm-back/role-revoke/role-denial/quota-retry/double-confirm/calendar/reload/old-v1/chain/cancel/pending-edit-lock/stale-action/owner-readonly/3-widths/2-themes/review-core-isolation');
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log(JSON.stringify({result:'pass',sourceCommit:release.sourceCommit,sourceDirty:release.sourceDirty,checks,errors,requests,realPayments:false}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
