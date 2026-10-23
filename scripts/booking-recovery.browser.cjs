'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{setStayRange}=require('./stay-calendar-browser-helper.cjs');
const fixture=require('./fixtures/canva-core-ui.cjs'),root=path.resolve(process.env.VIEWS_JOURNEY_DIST||'dist');
const source=path.resolve(process.env.VIEWS_JOURNEY_SOURCE||'.'),messages=require(path.join(source,'src/features/local-core/staff-translations.json'));
const release=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8')),origin='http://127.0.0.1:4173',checks=[],errors=[],unexpected=[];
const scope={organizationId:fixture.id,userId:fixture.id,membershipId:fixture.id,propertyId:fixture.id};
const stamp='2026-10-31T19:30:00Z';
(async()=>{let browser;try{
 const executablePath=process.env.VIEWS_BROWSER_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);browser=await chromium.launch({headless:true,...executablePath?{executablePath}:{}});
 for(const locale of ['en','ru','uz']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(10000);await page.clock.setFixedTime(new Date(stamp));await page.addInitScript(l=>localStorage.setItem('views.staff.locale',l),locale);page.on('pageerror',e=>errors.push(e.message));
  let holdMode='drop',refreshFail=false,quoteCalls=0,activeScope=scope;const attempts=[];
  const t=k=>messages[k]?.[locale]||k;
  await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(u.origin!==origin){unexpected.push(u.origin);return route.abort();}
   if(u.pathname==='/local-api/quotes'){assert.equal(r.method(),'POST');quoteCalls++;return json({quoteId:fixture.id,currency:'UZS',nights:2,totalMinor:'10000',expiresAt:quoteCalls===1?'2026-10-31T19:30:10Z':'2099-01-01T00:00:00Z',lines:[]});}
   if(u.pathname==='/local-api/holds'){
    assert.equal(r.method(),'POST');attempts.push({key:r.headers()['idempotency-key'],body:r.postDataJSON()});
    const intent=await page.evaluate(scope=>new Promise((resolve,reject)=>{const req=indexedDB.open('views.booking-recovery.v1',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('attempts','readonly'),get=tx.objectStore('attempts').get(JSON.stringify([scope.organizationId,scope.userId,scope.membershipId,scope.propertyId]));get.onsuccess=()=>resolve(get.result??null);tx.oncomplete=()=>db.close();};}),scope);assert.equal(intent.key,r.headers()['idempotency-key']);assert.equal(intent.quoteId,r.postDataJSON().quoteId);assert.deepEqual(Object.keys(intent).sort(),['key','quoteId','scope','version']);
    if(holdMode==='drop')return route.abort('connectionfailed');
    if(holdMode==='expired')return json({error:'QUOTE_EXPIRED'},409);
    if(holdMode==='not-created')return json({error:'HOLD_NOT_CREATED'},409);
    if(holdMode==='forbidden')return json({error:'PROPERTY_FORBIDDEN'},403);
    refreshFail=true;return json({reservationId:fixture.id,confirmationCode:'RECOVERED-SYNTHETIC',holdExpiresAt:null,status:'cancelled',activeHold:false,idempotentReplay:true});
   }
   if(/^\/(local-api|api|guest-api)\//.test(u.pathname)){
    if(r.method()!=='GET'){unexpected.push(r.method()+u.pathname);return route.abort();}
    if(u.pathname==='/local-api/workspace'&&refreshFail)return json({error:'CORE_UNAVAILABLE'},503);
    const body=fixture.response(u.pathname,{staff:'front_desk'});
    if(u.pathname==='/local-api/workspace'){body.recoveryScope=activeScope;body.units=[{unitId:fixture.id,ratePlanId:fixture.id,code:'Recovery synthetic',unitTypeName:{en:'Synthetic'},maxGuests:3,rateName:{en:'Synthetic'},currency:'UZS',baseNightlyMinor:'5000'}];}
    if(body===undefined){unexpected.push(u.pathname);return route.abort();}return json(body);
   }
   if(r.method()!=='GET'){unexpected.push(r.method()+u.pathname);return route.abort();}
   const file=path.resolve(root,u.pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({path:file,contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg'})[path.extname(file)]});
  });
  await page.goto(origin+'/?api=local-core');const workspace=page.locator('#staff-booking');await workspace.waitFor();
  await setStayRange(page,workspace,'2026-11-30','2026-12-02');await workspace.locator('button[type=submit]').click();await workspace.locator('.localAmount').waitFor();
  await workspace.getByRole('button',{name:t('Создать тестовый резерв'),exact:true}).click();await workspace.getByTestId('booking-hold-recovery').waitFor();
  assert.equal(attempts.length,1);assert.ok(attempts[0].key);assert.deepEqual(attempts[0].body,{quoteId:fixture.id});assert.equal(await workspace.locator('button[type=submit]').isDisabled(),true);assert.equal(await workspace.getByTestId('stay-date-range').getByRole('button').isDisabled(),true);
  await page.clock.setFixedTime(new Date('2026-10-31T19:30:15Z'));await page.clock.runFor(1000);assert.equal(await workspace.getByTestId('booking-hold-retry').isEnabled(),true);
  await page.reload();await workspace.getByTestId('booking-hold-recovery').waitFor();assert.equal(attempts.length,1);assert.equal(quoteCalls,1);
  holdMode='forbidden';await workspace.getByTestId('booking-hold-retry').click();await page.waitForFunction(()=>document.querySelector('[data-testid="booking-hold-retry"]')&&!document.querySelector('[data-testid="booking-hold-retry"]').disabled);
  assert.equal(attempts.length,2);assert.equal(attempts[1].key,attempts[0].key);assert.deepEqual(attempts[1].body,{quoteId:fixture.id,recoveryOnly:true});assert.equal(await workspace.getByTestId('booking-hold-receipt').count(),0);
  holdMode='expired';await workspace.getByTestId('booking-hold-retry').click();await page.waitForFunction(()=>document.querySelector('[data-testid="booking-hold-retry"]')&&!document.querySelector('[data-testid="booking-hold-retry"]').disabled);assert.equal(attempts.length,3);assert.deepEqual(attempts[2],attempts[1]);
  holdMode='success';await workspace.getByTestId('booking-hold-retry').click();await workspace.getByTestId('booking-hold-receipt').waitFor();await workspace.getByTestId('booking-hold-refresh-error').waitFor();assert.equal(attempts.length,4);assert.deepEqual(attempts[3],attempts[1]);assert.equal(await workspace.getByTestId('booking-hold-recovery').count(),0);assert.match(await workspace.getByTestId('booking-hold-receipt').innerText(),/RECOVERED-SYNTHETIC/);
  const pending=await page.evaluate(scope=>new Promise((resolve,reject)=>{const req=indexedDB.open('views.booking-recovery.v1',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('attempts','readonly'),get=tx.objectStore('attempts').get(JSON.stringify([scope.organizationId,scope.userId,scope.membershipId,scope.propertyId]));get.onsuccess=()=>resolve(get.result??null);tx.oncomplete=()=>db.close();};}),scope);assert.equal(pending,null);
  assert.equal(quoteCalls,1);
  // A new uncertain operation survives a different current actor without disclosure.
  refreshFail=false;holdMode='drop';await workspace.locator('button[type=submit]').click();await workspace.locator('.localAmount').waitFor();await workspace.getByTestId('booking-hold-create').click();await workspace.getByTestId('booking-hold-recovery').waitFor();
  const pendingKey=attempts.at(-1).key,attemptCount=attempts.length;
  const second=await context.newPage();await second.clock.setFixedTime(new Date('2026-10-31T19:30:15Z'));await second.goto(origin+'/?api=local-core');await second.getByTestId('booking-hold-recovery').waitFor();assert.equal(attempts.length,attemptCount);await second.close();
  activeScope={...scope,userId:'22222222-2222-4222-8222-222222222222'};await page.reload();await workspace.locator('button[type=submit]').waitFor();assert.equal(await workspace.getByTestId('booking-hold-recovery').count(),0);assert.equal(await workspace.getByTestId('booking-hold-receipt').count(),0);
  activeScope=scope;await page.reload();await workspace.getByTestId('booking-hold-recovery').waitFor();holdMode='not-created';await workspace.getByTestId('booking-hold-retry').click();await workspace.getByTestId('booking-hold-recovery').waitFor({state:'hidden'});assert.equal(attempts.at(-1).key,pendingKey);assert.equal(await workspace.locator('button[type=submit]').isEnabled(),true);assert.equal(await workspace.getByTestId('booking-hold-receipt').count(),0);
  await page.evaluate(scope=>new Promise((resolve,reject)=>{const req=indexedDB.open('views.booking-recovery.v1',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('attempts','readwrite');tx.objectStore('attempts').put('corrupt',JSON.stringify([scope.organizationId,scope.userId,scope.membershipId,scope.propertyId]));tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}),scope);
  await page.reload();await workspace.getByTestId('booking-hold-storage-error').waitFor();assert.equal(await workspace.locator('button[type=submit]').isDisabled(),true);assert.equal(attempts.length,attemptCount+1);assert.equal(await page.evaluate(scope=>new Promise((resolve,reject)=>{const req=indexedDB.open('views.booking-recovery.v1',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('attempts','readonly'),get=tx.objectStore('attempts').get(JSON.stringify([scope.organizationId,scope.userId,scope.membershipId,scope.propertyId]));get.onsuccess=()=>resolve(get.result??null);tx.oncomplete=()=>db.close();};}),scope),'corrupt');
  checks.push(locale+': lost-response/persist-before-submit/expired-quote-retry/reload/same-key/forbidden-no-receipt/calendar-lock/terminal-replay/success-refresh-failure/two-tab-intent/scope-isolation/not-created-tombstone/corrupt-block/no-payment');await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(JSON.stringify({result:'pass',sourceCommit:release.sourceCommit,sourceDirty:release.sourceDirty,checks,errors,unexpected,realReservationsCreated:false}));
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
