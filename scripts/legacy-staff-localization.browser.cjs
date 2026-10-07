// Offline fixtures for the legacy CRM presentation; no real provider writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),catalog=require('../src/features/staff/legacy-staff-translations.json');
const tr=(locale,key)=>locale==='en'?key:catalog[key]?.[locale]||key;
const origin='https://legacy-staff.invalid',tabs=['Overview','Inbox','Operations','Front Desk','Guests CRM','Housekeeping','Maintenance','Shift Handover','Exceptions','Stay Card','Apartment Timeline','Host Desk','Finance','Admin','Integrations','Team'];
const target=process.env.VIEWS_LEGACY_PROOF_BUILD||'dist';assert.ok(['dist','dist-android'].includes(target));const prefix=target==='dist-android'?'/views-hotel-platform/':'/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),errors=[],unexpected=[],checks=[];
 async function pageWith(handler){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  if(target==='dist-android')await page.addInitScript(()=>{delete String.prototype.replaceAll;});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin!==origin){unexpected.push(u.origin);return route.abort();}
   if(u.pathname.startsWith('/api/')){if(handler)return handler(route,u);unexpected.push(u.pathname);return route.abort();}
   if(!u.pathname.startsWith(prefix)){unexpected.push(u.pathname);return route.abort();}
   const file=path.resolve(target,u.pathname.slice(prefix.length)||'index.html');
   if(!file.startsWith(path.resolve(target)+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(file)]});
  });return page;
 }
 const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 async function fits(page,context){
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).position!=='fixed').slice(0,5).map(e=>e.className||e.tagName)}));
  assert.ok(overflow.scroll<=overflow.width,context+' '+JSON.stringify(overflow));
 }
 try{
  const page=await pageWith();await page.goto(origin+prefix+'?api=demo',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Staff CRM',exact:true}).click();
  for(const locale of ['ru','uz','en']){
   await page.locator('.staffLanguage select').selectOption(locale);assert.equal(await page.locator('html').getAttribute('lang'),locale);
   for(const tab of tabs){
    await page.setViewportSize({width:1440,height:1000});await page.locator('.sidebar').getByRole('button',{name:tr(locale,tab),exact:true}).click();
    assert.equal(await page.locator('.staffHead h1').innerText(),tr(locale,tab));
    for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});await fits(page,locale+' '+tab+' '+width);}
   }
  }
  checks.push('sixteen_sections_three_languages_four_widths');
  for(const role of ['cleaner','concierge','technician','front_desk','general_manager','super_admin']){
   await page.locator('.staffHead select').selectOption(role);await page.setViewportSize({width:390,height:1000});await fits(page,role);
   const nav=page.locator('.sidebar button');assert.ok(await nav.count()>0);await nav.first().click();
  }
  checks.push('six_demo_roles_mobile_navigation');
  await page.locator('.sidebar').getByRole('button',{name:'Inbox',exact:true}).click();
  await page.locator('.inboxTabs button').nth(2).click();assert.equal(await page.locator('.unifiedInbox .order').count(),0);
  await page.locator('.inboxTabs button').nth(1).click();assert.equal(await page.locator('.unifiedInbox .order').count(),2);
  await page.locator('.inboxTabs button').nth(0).click();assert.equal(await page.locator('.unifiedInbox .order').count(),3);
  checks.push('inbox_filters_change_visible_rows');
  const mobile=page.locator('.staffMobileDock');await mobile.getByRole('button',{name:'create',exact:true}).click();
  await page.locator('.mobileCreate textarea').fill('Keep user text: Maintenance');await page.locator('.mobileCreate select').first().selectOption('cleaning');
  await page.locator('.staffLanguage select').selectOption('uz');assert.equal(await page.locator('.mobileCreate textarea').inputValue(),'Keep user text: Maintenance');assert.equal(await page.locator('.mobileCreate select').first().inputValue(),'cleaning');
  await page.locator('.staffMobileSheet').getByRole('button',{name:tr('uz','Create'),exact:true}).click();await page.getByText(tr('uz','Task creation is available in live staging runtime.'),{exact:true}).waitFor();
  await page.locator('.staffSheetClose').click();assert.equal(await page.locator('.staffMobileSheet').count(),0);
  await mobile.getByRole('button',{name:tr('uz','proof'),exact:true}).click();assert.equal(await page.locator('.mobileProof button:disabled').count(),2);await page.locator('.staffSheetClose').click();
  checks.push('mobile_form_preserved_demo_uploads_honest');
  await page.getByRole('button',{name:'Mehmon ilovasi',exact:true}).click();assert.equal(await page.locator('.guestLanguage select').inputValue(),'en');
  await page.getByRole('button',{name:'Staff CRM',exact:true}).click();assert.equal(await page.locator('.staffLanguage select').inputValue(),'uz');
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Staff CRM',exact:true}).click();assert.equal(await page.locator('.staffLanguage select').inputValue(),'uz');checks.push('guest_staff_preferences_separate_and_persisted');
  await page.close();
  // A real API-shaped fixture proves display translation does not change requests or names.
  const writes=[],requests=[];let orders=[{id:'order-1',title:'Maintenance',category:'cleaning',status:'assigned',priority:'high',assigned_user_id:'staff-1',unit_id:'101',guest_id:'Guest untouched',version:3}];
  const live=await pageWith(async(route,u)=>{
   requests.push(u.pathname);const req=route.request();
   if(u.pathname==='/api/session')return json(route,{authenticated:true,session:{mode:'staff',userId:'staff-1',role:'general_manager',organizationId:'org',propertyIds:['utower']}});
   if(req.method()!=='GET'){
    const body=req.postDataJSON();writes.push({path:u.pathname,body});
    if(u.pathname==='/api/service-order-action'){orders=orders.map(o=>({...o,status:'in_progress',version:4}));return json(route,{id:body.id,status:'in_progress',version:4});}
    if(u.pathname==='/api/service-orders')return json(route,{id:'created-fixture',status:'new'});
    return json(route,{ok:true});
   }
   if(u.pathname==='/api/service-orders')return json(route,{items:orders});
   if(u.pathname==='/api/operations-summary')return json(route,{lostFoundOpen:0,damageOpen:0,inventoryLow:0,serviceOrdersOpen:1});
   if(u.pathname==='/api/operations-observability')return json(route,{outboxPending:0,outboxRetrying:0,outboxLeased:0,outboxDeadLetter:0,stale:{serviceOrders:0,housekeeping:0,maintenance:0},recentEvents:[]});
   if(u.pathname==='/api/operations-exceptions')return json(route,{lostFound:[],damage:[],lowStock:[]});
   if(u.pathname==='/api/team-workload')return json(route,{staff:[],summary:{activeServiceOrders:1,activeHousekeeping:0,activeMaintenance:0,unassignedServiceOrders:0}});
   if(u.pathname==='/api/finance-summary')return json(route,{payments:[{currency:'UZS',intents:1,amountMinor:12345,capturedMinor:12345,refundedMinor:0,netCapturedMinor:12345,projectedAt:'2026-10-07T12:00:00Z'}],ledger:{accounts:[{currency:'UZS',accountCode:'guest_deposits',accountType:'liability',debitMinor:0,creditMinor:12345,netDebitMinor:-12345}],postedJournals:1,unbalancedPostedJournals:[]},liveMoneyEnabled:false});
   if(u.pathname==='/api/analytics-dashboard')return json(route,{period:{from:'2026-10-01',to:'2026-10-07'},freshness:{projectionStatus:'healthy',pendingEvents:0,scopePropertyCount:1},cache:{hit:false},kpisByCurrency:[{currency:'UZS',propertyCount:1,bookingCount:1,occupancy:0.75,adrMinor:'900719925474099301',revparMinor:'12345',grossRevenueMinor:'900719925474099301',netRevenueMinor:'900719925474099301'}]});
   return json(route,{items:[]});
  });
  await live.goto(origin+prefix+'?api=live',{waitUntil:'networkidle'});
  for(const locale of ['ru','uz','en']){
   await live.locator('.staffLanguage select').selectOption(locale);
   await live.locator('.sidebar').getByRole('button',{name:tr(locale,'Overview'),exact:true}).click();await live.waitForFunction(()=>document.querySelector('.staffMain')?.textContent?.includes('900'),undefined,{timeout:10000});{const actual=await live.locator('.staffMain').innerText();const expected=await live.evaluate(l=>BigInt('900719925474099301').toLocaleString(l),locale);assert.ok(actual.replace(/\s/g,' ').includes(expected.replace(/\s/g,' ')),JSON.stringify({locale,expected,money:actual.match(/[0-9][0-9\s,\.]{10,}/g)}));}
   for(const tab of tabs){await live.setViewportSize({width:1440,height:1000});await live.locator('.sidebar').getByRole('button',{name:tr(locale,tab),exact:true}).click();await live.waitForLoadState('networkidle');for(const width of [360,390,768,1440]){await live.setViewportSize({width,height:1000});await fits(live,'live '+locale+' '+tab+' '+width);}}
  }
  await live.locator('.sidebar').getByRole('button',{name:'Inbox',exact:true}).click();await live.locator('.staffLanguage select').selectOption('ru');
  assert.equal(await live.locator('.unifiedInbox .order b').first().innerText(),'Maintenance');
  await live.locator('.unifiedInbox').getByRole('button',{name:tr('ru','Start'),exact:true}).click();await live.getByText(tr('ru','in progress'),{exact:true}).first().waitFor();
  assert.deepEqual(writes[0],{path:'/api/service-order-action',body:{id:'order-1',action:'start',version:3}});
  checks.push('all_live_screens_with_http_fixtures_preserve_protocol_and_user_text');
  await live.setViewportSize({width:390,height:1000});await live.locator('.staffMobileDock').getByRole('button',{name:tr('ru','create'),exact:true}).click();
  await live.locator('.mobileCreate textarea').fill('User-entered task');await live.locator('.mobileCreate select').first().selectOption('cleaning');
  const before=writes.length;await live.locator('.staffLanguage select').selectOption('uz');assert.equal(writes.length,before);await live.locator('.mobileCreate').getByRole('button',{name:tr('uz','Create'),exact:true}).click();
  await live.getByText(tr('uz','Created: {id}').replace('{id}','created-fixture'),{exact:true}).waitFor();assert.deepEqual(writes.at(-1),{path:'/api/service-orders',body:{propertyId:'utower',category:'cleaning',title:'User-entered task',priority:'normal'}});
  checks.push('live_form_language_switch_never_writes_or_changes_api_enum');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(JSON.stringify({stage:'7.49',result:'pass',target,checks,httpFixturesOnly:true,externalRequestsSent:0,androidDeviceTested:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
