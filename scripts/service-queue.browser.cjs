'use strict';
// Independent normal-build Core queue proof; all API responses are synthetic reads.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),fixture=require('./fixtures/canva-core-ui.cjs');
const root=path.resolve(process.env.VIEWS_JOURNEY_DIST||'dist'),origin='http://127.0.0.1:4173';
const release=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));
const kinds=['cleaning','laundry','market','concierge'],id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const row=(kind,n)=>({id:id(n),kind,stage:kind==='market'?'reserved':'requested',revision:1,unitCode:'SYNTHETIC-'+kind+'-'+n,sla:kind==='concierge'?{policy:'concierge-response-15m-v1',hypothesis:true,evaluatedAt:'2026-10-25T08:00:00Z',responseDueAt:'2026-10-25T08:15:00Z',state:'pending',overdueSeconds:0,answeredLate:null}:null});
(async()=>{let browser;const checks=[],errors=[],unexpected=[];try{
 const executablePath=process.env.VIEWS_BROWSER_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);browser=await chromium.launch({headless:true,...executablePath?{executablePath}:{}});
 for(const locale of ['en','ru','uz']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(10000);await context.addInitScript(l=>localStorage.setItem('views.staff.locale',l),locale);page.on('pageerror',e=>errors.push(e.message));
  let mode='ok',delayed=null,delayEntered=null;const reads=[];
  await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url()),json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.origin!==origin||request.method()!=='GET'){unexpected.push(request.method()+' '+url.pathname);return route.abort();}
   if(url.pathname==='/local-api/service-orders/queue'){
    reads.push(url.search);if(mode==='error')return json({error:'CORE_UNAVAILABLE'},503);if(mode==='revoked')return json({error:'STAFF_SESSION_REQUIRED'},401);
    const kind=url.searchParams.get('kind'),cursor=url.searchParams.get('cursor');
    const sections=(kind?[kind]:kinds).map((k,index)=>({kind:k,status:mode==='restricted'?(k==='market'?'forbidden':k==='concierge'?'disabled':'available'):'available',items:mode==='restricted'&&['market','concierge'].includes(k)?[]:[row(k,cursor?10:index+1)],nextCursor:!cursor&&k==='cleaning'?id(1):null}));
    if(mode==='delay'){await new Promise(resolve=>{delayed=()=>{resolve();};delayEntered?.();});}return json({sections});
   }
   if(url.pathname.startsWith('/local-api/')){const data=fixture.response(url.pathname,{staff:'manager'});if(data===undefined){unexpected.push(url.pathname);return route.abort();}return json(data);}
   const file=path.resolve(root,url.pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({path:file,contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]});
  });
  await page.goto(origin+'/?api=local-core');await page.getByTestId('queue-open').click();const queue=page.getByTestId('staff-service-queue');await queue.waitFor();await page.getByTestId('queue-item-cleaning-'+id(1)).waitFor();
  assert.equal(await queue.locator('[data-testid^="queue-item-"]').count(),4);
  await page.getByTestId('queue-more-cleaning').click();await page.getByTestId('queue-item-cleaning-'+id(10)).waitFor();assert.equal(await queue.locator('[data-testid^="queue-item-"]').count(),5);assert.ok(reads.some(q=>new URLSearchParams(q).get('cursor')===id(1)));
  await page.getByTestId('queue-item-market-'+id(3)).click();await page.getByTestId('queue-detail').waitFor();assert.match(await page.getByTestId('queue-detail').innerText(),/SYNTHETIC-market-3/);await page.getByTestId('queue-close-detail').click();assert.equal(await page.getByTestId('queue-detail').count(),0);
  mode='delay';const entered=new Promise(resolve=>{delayEntered=resolve;});await page.getByTestId('queue-refresh').click();await entered;await page.getByTestId('queue-open').click();assert.equal(await queue.locator('[data-testid^="queue-item-"]').count(),0);if(delayed){delayed();delayed=null;}mode='ok';await page.getByTestId('queue-open').click();await page.getByTestId('queue-item-market-'+id(3)).waitFor();
  mode='restricted';await page.getByTestId('queue-refresh').click();await page.getByTestId('queue-item-market-'+id(3)).waitFor({state:'hidden'});await page.getByTestId('queue-item-cleaning-'+id(1)).waitFor();assert.equal(await queue.locator('[data-testid^="queue-item-"]').count(),2);assert.ok((await page.getByTestId('queue-market').innerText()).length>0);assert.ok((await page.getByTestId('queue-concierge').innerText()).length>0);
  mode='error';await page.getByTestId('queue-refresh').click();await page.getByTestId('queue-error').waitFor();assert.equal(await queue.locator('[data-testid^="queue-item-"]').count(),0);
  mode='ok';await page.getByTestId('queue-refresh').click();await page.getByTestId('queue-item-market-'+id(3)).waitFor();
  await context.setOffline(true);await page.getByTestId('queue-item-market-'+id(3)).waitFor({state:'hidden'});assert.equal(await queue.locator('[data-testid^="queue-item-"]').count(),0);await context.setOffline(false);await page.getByTestId('queue-refresh').click();await page.getByTestId('queue-item-market-'+id(3)).waitFor();
  for(const width of [360,768,1440]){await page.setViewportSize({width,height:900});for(let theme=0;theme<2;theme++){await page.locator('[data-theme-toggle]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}}
  mode='revoked';await page.getByTestId('queue-refresh').click();await page.getByTestId('queue-item-market-'+id(3)).waitFor({state:'hidden'});assert.equal(await page.getByTestId('queue-detail').count(),0);
  checks.push(locale+': four-services/independent-page/summary/forbidden-disabled/error-clears/recovery/offline/role-revocation/3-widths/2-themes/read-only');await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(JSON.stringify({result:'pass',sourceCommit:release.sourceCommit,sourceDirty:release.sourceDirty,checks,errors,unexpected,httpFixturesOnly:true,realOrdersCreated:false}));
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
