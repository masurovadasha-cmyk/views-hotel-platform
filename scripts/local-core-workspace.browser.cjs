'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.join(process.env.LOCALAPPDATA||'','VIEWS-Staging');
const {chromium}=require(path.join(root,'tools/browser-tests/node_modules/playwright'));
const base='http://127.0.0.1:4173',dir=path.join(root,'evidence');
(async()=>{
 if(process.platform!=='win32'||process.argv[2]!=='--ack=LOCAL_BROWSER_TEST')throw Error('LOCAL_BROWSER_ACK_REQUIRED');
 const browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true});
 const page=await browser.newPage({viewport:{width:1440,height:1050},locale:'ru-RU'});
 const pageErrors=[],routes=new Set(),sizes=[];let secretHeader=false,reservationId=null,released=false;
 page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/local-api/'))routes.add(u.pathname);const h=r.headers();if(h['x-views-internal-key']||h['x-views-service-token'])secretHeader=true;});
 const report={schemaVersion:1,stage:'7.24',result:'fail',browser:'Microsoft Edge (isolated temporary profile)',scope:'localhost-only',sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).stdout.trim(),
  pageErrors,sizes,realPayments:false,physicalAndroidTested:false,trackedSourceDirty:spawnSync('git',['diff','--quiet','HEAD'],{windowsHide:true}).status!==0};
 try{
  await page.goto(base+'/?api=local-core',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Рабочая область бронирования',exact:true}).waitFor();
  await page.getByLabel('Апартамент',{exact:true}).selectOption({index:1});
  const day=n=>new Date(Date.now()+5*3600000+(180+n)*86400000).toISOString().slice(0,10);
  await page.getByLabel('Заезд',{exact:true}).fill(day(0));await page.getByLabel('Выезд',{exact:true}).fill(day(2));
  const [q]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/local-api/quotes')),page.getByRole('button',{name:'Рассчитать через Core',exact:true}).click()]);
  assert.equal(q.status(),200);const quote=await q.json();assert.equal(quote.totalMinor,'130000000');
  await page.locator('.localAmount').waitFor();assert.equal(await page.locator('.localAmount').textContent(),'1 300 000 UZS');
  const [h]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/local-api/holds')),page.getByRole('button',{name:'Создать тестовый резерв',exact:true}).click()]);
  assert.equal(h.status(),200);const hold=await h.json();reservationId=hold.reservationId;
  await page.locator('[data-reservation-id="'+reservationId+'"]').waitFor();
  await page.reload({waitUntil:'networkidle'});
  const row=page.locator('[data-reservation-id="'+reservationId+'"]');await row.waitFor();assert.ok((await row.textContent()).includes(hold.confirmationCode));
  await page.screenshot({path:path.join(dir,'stage724-workspace-desktop.png'),fullPage:true});
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));sizes.push(size);
    assert.ok(size.document<=width+1&&size.body<=width+1,'HORIZONTAL_OVERFLOW:'+JSON.stringify(size));
    if(width===390)await page.screenshot({path:path.join(dir,'stage724-workspace-mobile.png'),fullPage:true});
  }
  const [r]=await Promise.all([page.waitForResponse(x=>x.url().endsWith('/local-api/release')),row.getByRole('button',{name:'Снять резерв',exact:true}).click()]);
  assert.equal(r.status(),200);released=true;
  await row.getByText('Отменён',{exact:true}).waitFor();
  await page.getByLabel('Апартамент',{exact:true}).selectOption({index:1});
  await page.getByLabel('Заезд',{exact:true}).fill(day(0));await page.getByLabel('Выезд',{exact:true}).fill(day(2));
  const [again]=await Promise.all([page.waitForResponse(x=>x.url().endsWith('/local-api/quotes')),page.getByRole('button',{name:'Рассчитать через Core',exact:true}).click()]);assert.equal(again.status(),200);
  await page.route('**/local-api/workspace',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'CORE_UNAVAILABLE'})}));
  await page.getByRole('button',{name:'Обновить из БД',exact:true}).click();await page.getByRole('alert').getByText(/Core недоступен/).waitFor();
  await page.unroute('**/local-api/workspace');
  assert.deepEqual(pageErrors,[]);assert.equal(secretHeader,false);
  Object.assign(report,{result:'pass',serverQuoteTotalMinor:quote.totalMinor,reservationPersistedAcrossReload:true,reservationReleased:true,
   sameDatesAvailableAfterRelease:true,unavailableCoreErrorShown:true,browserServiceCredentialsExposed:false,apiPaths:[...routes],checkedAt:new Date().toISOString()});
 }catch(e){report.error=e.message;process.exitCode=1;await page.screenshot({path:path.join(dir,'stage724-browser-failure.png'),fullPage:true}).catch(()=>{});}
 finally{
  if(reservationId&&!released)await page.evaluate(async id=>{
    const h={'X-Views-Local-Workspace':'1'};const s=await(await fetch('/local-api/session',{headers:h})).json();h['X-CSRF-Token']=s.csrf;
    await fetch('/local-api/workspace',{headers:h});await fetch('/local-api/release',{method:'POST',headers:{...h,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({reservationId:id})});
  },reservationId).catch(()=>{});
  await browser.close();
 }
 fs.writeFileSync(path.join(dir,'stage724-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error('BROWSER_TEST_FAILED:'+e.message);process.exitCode=1;});
