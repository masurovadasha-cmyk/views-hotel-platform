'use strict';
const durable=require('./demo-market-storage-browser-helper.cjs');
// Upgrade and atomic replacement proof against the actual built UI, without Core/network writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const source=path.resolve(process.env.VIEWS_REPLACEMENT_SOURCE||'.');
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
  for(const locale of ['en','ru','uz']){
   const context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage();page.setDefaultTimeout(10000);
   await page.addInitScript(l=>localStorage.setItem('views.guest.locale',l),locale);
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin||r.method()!=='GET'||/^\/(api|local-api|guest-api)\//.test(u.pathname)){requests.push(r.method()+' '+u.pathname);return route.abort();}return route.continue();});
   const t=k=>messages[k]?.[locale]||k,shop=page.getByTestId('guest-market');
   const button=k=>shop.getByRole('button',{name:t(k),exact:true});
   const order=id=>shop.locator('[data-demo-order="'+id+'"]');
   const state=()=>durable.state(page);
   const stock=()=>shop.locator('[data-stock="sample-water"]').innerText();
   async function open(){await page.goto(origin+'/?api=demo');await page.getByRole('button',{name:/V Market/}).first().click();await durable.ready(page);await shop.waitFor();await durable.ready(page);}
   async function seed(value){await durable.seed(page,value);await open();}
   await open();await seed(legacy);
   assert.equal(await stock(),'0');assert.equal(await order('DEMO-1').count(),1);
   await order('DEMO-1').getByRole('button',{name:t('Edit demo order'),exact:true}).click();await durable.ready(page);
   assert.equal(await page.getByTestId('market-count').innerText(),'10');
   assert.equal((await state()).orders[0].status,'reserved');
   assert.equal(await shop.locator('[data-edit-stock="sample-water"]').innerText(),'10');
   await shop.getByRole('button',{name:t('Increase')+': '+t('Still water'),exact:true}).click();await durable.ready(page);
   await button('Review demo order').click();await durable.ready(page);await shop.getByRole('alert').waitFor();
   assert.equal((await state()).pending,null);assert.deepEqual((await state()).orders,legacy.orders);
   await shop.getByRole('button',{name:t('Decrease')+': '+t('Still water'),exact:true}).click();await durable.ready(page);
   await open();assert.equal(await page.getByTestId('market-count').innerText(),'10');
   await button('Clear list').click();await durable.ready(page);assert.deepEqual((await state()).cart,{});assert.deepEqual((await state()).orders,legacy.orders);
   await button('Cancel editing').click();await durable.ready(page);assert.deepEqual((await state()).orders,legacy.orders);assert.deepEqual((await state()).cart,{});
   await order('DEMO-1').getByRole('button',{name:t('Edit demo order'),exact:true}).click();await durable.ready(page);
   await shop.getByRole('button',{name:t('Decrease')+': '+t('Still water'),exact:true}).click();await durable.ready(page);
   await button('Review demo order').evaluate(b=>{b.click();b.click();});await durable.ready(page);
   const pending=(await state()).pending;assert.ok(pending);assert.equal(await shop.getByRole('alert').count(),0);
   assert.deepEqual((await state()).orders,legacy.orders);
   await button('Back to basket').click();await durable.ready(page);assert.equal((await state()).pending,null);assert.equal(await page.getByTestId('market-count').innerText(),'9');
   await button('Review demo order').click();await durable.ready(page);const token=(await state()).pending.id;
   await open();assert.equal((await state()).pending.id,token);assert.deepEqual((await state()).orders,legacy.orders);
   // A failed durable write must not release the original reservation or claim success.
   await durable.failWrites(page);
   await button('Confirm demo order').click();await durable.ready(page);await shop.getByRole('alert').waitFor();
   assert.deepEqual((await state()).orders,legacy.orders);assert.equal((await state()).pending.id,token);
   await durable.restoreWrites(page);
   await button('Confirm demo order').evaluate(b=>{b.click();b.click();});await durable.ready(page);
   let committed=await state();assert.equal(committed.orders.length,2);assert.equal(committed.pending,null);assert.deepEqual(committed.cart,{});
   const old=committed.orders.find(o=>o.id==='DEMO-1'),replacement=committed.orders.find(o=>o.id===token);
   assert.equal(old.status,'cancelled');assert.equal(old.replacedByOrderId,token);assert.equal(replacement.status,'reserved');assert.equal(replacement.replacesOrderId,'DEMO-1');assert.deepEqual(replacement.lines,{'sample-water':9});assert.equal(await stock(),'1');
   assert.equal(await order('DEMO-1').getByRole('button').count(),0);
   await open();assert.deepEqual((await state()).orders,committed.orders);assert.equal(await stock(),'1');
   await order(token).getByRole('button',{name:t('Cancel demo order'),exact:true}).evaluate(b=>{b.click();b.click();});await durable.ready(page);
   assert.equal(await stock(),'10');assert.equal(await button('Cancel demo order').count(),0);assert.equal((await state()).orders.length,2);
   // An unrelated basket must not be silently overwritten by editing history.
   await seed({...legacy,cart:{'sample-tea':1}});
   const edit=order('DEMO-1').getByRole('button',{name:t('Edit demo order'),exact:true});
   assert.ok(await edit.count()===0||await edit.isDisabled());assert.deepEqual((await state()).cart,{'sample-tea':1});
   // Old pending checkout still works after the additive schema upgrade.
   await seed({version:1,sequence:1,cart:{'sample-water':1},pending:{id:'DEMO-1',lines:{'sample-water':1}},orders:[]});
   await button('Confirm demo order').click();await durable.ready(page);assert.equal(await stock(),'9');assert.equal((await state()).orders.length,1);
   // A stale visible Confirm cannot apply its old token to a later basket.
   await seed({...legacy,sequence:2,editingOrderId:'DEMO-1',cart:{'sample-water':9},pending:{id:'DEMO-2',lines:{'sample-water':9},replacesOrderId:'DEMO-1'}});
   const later={...legacy,sequence:2,cart:{'sample-tea':1}};
   await durable.seed(page,later);
   await button('Confirm demo order').click();await durable.ready(page);assert.deepEqual(await state(),later);assert.equal(await stock(),'0');
   for(const width of [360,768,1440]){await page.setViewportSize({width,height:900});for(let n=0;n<2;n++){await page.locator('[data-theme-toggle]').click();await durable.ready(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}}
   assert.equal(await shop.getByText(t('Prices are not configured. Currency: UZS. No amount is charged.'),{exact:true}).count(),1);
   checks.push(locale+': legacy-upgrade/edit-reload/discard/clear-draft/own-held-stock/overstock-rejection/repeated-review/quota-retry/repeated-confirm/backlinks/cancel/unrelated-cart/old-pending/stale-confirm/3-widths/2-themes/no-charge');
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log(JSON.stringify({result:'pass',sourceCommit:release.sourceCommit,sourceDirty:release.sourceDirty,checks,errors,requests,realPayments:false}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
