'use strict';
const durable=require('./demo-market-storage-browser-helper.cjs');
const views=require('./market-view-browser-helper.cjs');
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
   const context=await browser.newContext({viewport:{width:390,height:844}});
   await context.addInitScript(l=>localStorage.setItem('views.guest.locale',l),locale);
   async function make(){const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin||r.method()!=='GET'||/^\/(api|local-api|guest-api)\//.test(u.pathname)){requests.push(r.method()+' '+u.pathname);return route.abort();}return route.continue();});return p;}
   const t=k=>messages[k]?.[locale]||k;
   async function open(p){await p.goto(origin+'/?api=demo');await p.getByTestId('guest-market-shortcut').click();await p.getByTestId('guest-market').waitFor();}
   const btn=(p,k)=>views.button(p,k,t);
   let page=await make();await page.goto(origin+'/release.json');
   const old={version:1,sequence:2,cart:{'sample-water':9},pending:{id:'DEMO-2',lines:{'sample-water':9},replacesOrderId:'DEMO-1'},editingOrderId:'DEMO-1',orders:legacy.orders};
   const oldRaw=JSON.stringify(old);await page.evaluate(v=>sessionStorage.setItem('views.demo-market.v1',v),oldRaw);await open(page);
   await btn(page,'Confirm demo order').waitFor();assert.deepEqual(await durable.state(page),old);assert.equal(await page.evaluate(()=>sessionStorage.getItem('views.demo-market.v1')),oldRaw);
   await page.close();page=await make();await open(page);await btn(page,'Confirm demo order').waitFor();assert.deepEqual(await durable.state(page),old);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('views.demo-market.v1')),null);
   const other=await make();await open(other);await btn(other,'Confirm demo order').waitFor();
   const firstConfirm=await btn(page,'Confirm demo order').elementHandle(),secondConfirm=await btn(other,'Confirm demo order').elementHandle();
   await Promise.all([firstConfirm.evaluate(b=>b.click()),secondConfirm.evaluate(b=>b.click())]);
   await page.waitForFunction(()=>!document.querySelector('[data-testid="market-review"]'));
   let result=await durable.state(page);assert.equal(result.orders.length,2);assert.equal(result.orders.find(o=>o.id==='DEMO-1').replacedByOrderId,'DEMO-2');assert.equal(result.orders.find(o=>o.id==='DEMO-2').status,'reserved');
   // Another tab observes committed inventory; no duplicated reservation after a race.
   await other.bringToFront();await views.view(other,'catalogue');await other.waitForFunction(()=>document.querySelector('[data-stock="sample-water"]')?.textContent==='1');
   // Aborting an actual readwrite transaction must roll back history and quantities.
   await page.bringToFront();await page.evaluate(()=>{window.qaAbortPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){const r=window.qaAbortPut.apply(this,arguments);if(this.name==='ledger')this.transaction.abort();return r;};});
   const before=await durable.record(page);await btn(page,'Cancel demo order').click();await page.getByRole('alert').waitFor();assert.deepEqual(await durable.record(page),before);
   await page.evaluate(()=>{IDBObjectStore.prototype.put=window.qaAbortPut;window.qaBroadcast=BroadcastChannel.prototype.postMessage;BroadcastChannel.prototype.postMessage=function(){throw new Error('Synthetic notification failure');};});await btn(page,'Cancel demo order').click();await views.view(page,'catalogue');await page.waitForFunction(()=>document.querySelector('[data-stock="sample-water"]')?.textContent==='10');
   await durable.ready(page);assert.equal(await page.getByRole('alert').count(),0);await page.evaluate(()=>{BroadcastChannel.prototype.postMessage=window.qaBroadcast;});
   await other.bringToFront();await other.evaluate(()=>window.dispatchEvent(new Event('focus')));await views.view(other,'catalogue');await other.waitForFunction(()=>document.querySelector('[data-stock="sample-water"]')?.textContent==='10');
   result=await durable.state(page);assert.equal(result.orders.length,2);assert.equal(result.orders.every(o=>o.status==='cancelled'),true);
   // Competing pre-upgrade source is preserved; no implicit merge or overwrite.
   const conflict=await make();await conflict.goto(origin+'/release.json');const different=JSON.stringify({...legacy,sequence:5});await conflict.evaluate(v=>sessionStorage.setItem('views.demo-market.v1',v),different);await open(conflict);await conflict.getByTestId('demo-market-storage-conflict').waitFor();assert.deepEqual(await durable.state(conflict),result);assert.deepEqual(await conflict.getByTestId('demo-market-storage-conflict').locator('textarea[readonly]').evaluateAll(nodes=>nodes.map(n=>n.value)),[JSON.stringify(result),different]);
   await conflict.getByTestId('demo-market-resolve-conflict').click();
   await conflict.waitForFunction(()=>!document.querySelector('[data-testid="demo-market-resolve-conflict"]'));
   const archived=await durable.record(conflict);assert.deepEqual(JSON.parse(archived.raw),result);assert.ok(archived.legacySources.includes(different));assert.ok((await conflict.getByTestId('demo-market-archives').locator('textarea[readonly]').evaluateAll(nodes=>nodes.map(n=>n.value))).includes(different));assert.equal(await conflict.evaluate(()=>sessionStorage.getItem('views.demo-market.v1')),different);
   await conflict.close();await other.close();await page.close();const fresh=await make();await open(fresh);assert.deepEqual(await durable.state(fresh),result);
   await durable.seed(fresh,'corrupt');await open(fresh);await fresh.getByRole('alert').waitFor();assert.equal((await durable.record(fresh)).raw,'corrupt');assert.ok(await btn(fresh,'Review demo order').count()===0||await btn(fresh,'Review demo order').isDisabled());
   checks.push(locale+': legacy-pending-edit-import/original-retained/close-newtab/two-tab-confirm/notifications/transaction-abort-retry/notification-failure-focus/conflict-explicit-archive/newpage/corrupt-fail-closed');
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log(JSON.stringify({result:'pass',sourceCommit:release.sourceCommit,sourceDirty:release.sourceDirty,checks,errors,requests,realPayments:false}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
