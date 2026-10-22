'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {setStayRange}=require('./stay-calendar-browser-helper.cjs');
const origin='http://127.0.0.1:4173',root=path.resolve('dist'),errors=[],unexpected=[],checks=[];
const stamp='2026-10-31T19:30:00Z'; // Already November 1 in the property's timezone.
let browser;
async function pageFor(timezoneId='UTC',handler){
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId});
 const page=await context.newPage();page.setDefaultTimeout(10000);await page.clock.setFixedTime(new Date(stamp));
 await page.addInitScript(()=>{localStorage.setItem('views.guest.locale','en');localStorage.setItem('views.staff.locale','en');});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin){unexpected.push(u.origin);return route.abort();}
  if(/^\/(local-api|api)\//.test(u.pathname)){if(handler)return handler(route,u);unexpected.push(u.pathname);return route.abort();}
  if(route.request().method()!=='GET'){unexpected.push('write:'+u.pathname);return route.abort();}
  const file=path.resolve(root,u.pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.json':'application/json','.svg':'image/svg+xml'}[path.extname(file)]});
 });return {page,context};
}
async function closed(page){await page.getByTestId('stay-calendar').waitFor({state:'hidden'});await page.waitForFunction(()=>!history.state?.viewsStayCalendar);}
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||'/usr/bin/chromium'});
 for(const timezone of ['America/Los_Angeles','Asia/Tashkent','Pacific/Kiritimati']){
  const {page,context}=await pageFor(timezone);await page.goto(origin+'/?api=demo');
  const search=page.locator('.searchBox'),trigger=search.getByTestId('stay-date-range').getByRole('button');
  await trigger.click();let picker=page.getByTestId('stay-calendar');
  assert.equal(await picker.locator('[data-date="2026-11-01"]').getAttribute('aria-current'),'date');
  await picker.getByTestId('stay-calendar-cancel').click();await closed(page);
  await setStayRange(page,search,'2026-11-30','2026-12-02');assert.match(await trigger.innerText(),/Nights: 2/);
  await trigger.click();await picker.locator('[data-date="2026-12-03"]').click();
  assert.equal(await picker.getByTestId('stay-calendar-save').isDisabled(),true);
  await picker.getByTestId('stay-calendar-cancel').click();await closed(page);assert.match(await trigger.innerText(),/2026-11-30.*2026-12-02/);
  assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  await trigger.click();await picker.getByTestId('stay-calendar-reset').click();await page.keyboard.press('Escape');await closed(page);assert.match(await trigger.innerText(),/2026-11-30/);
  await trigger.click();await picker.locator('[data-date="2026-12-04"]').click();await page.goBack();await picker.waitFor({state:'hidden'});assert.match(await trigger.innerText(),/2026-11-30/);
  await page.goForward();await picker.waitFor();assert.match(await picker.locator('.stayDateSummary').innerText(),/2026-11-30.*2026-12-02/);await picker.getByTestId('stay-calendar-cancel').click();await closed(page);
  await setStayRange(page,search,'2026-12-31','2027-01-01');assert.match(await trigger.innerText(),/Nights: 1/);
  await setStayRange(page,search,'2028-02-28','2028-03-01');assert.match(await trigger.innerText(),/Nights: 2/);
  await setStayRange(page,search,'','');assert.equal((await trigger.innerText()).includes('2028'),false);
  // Nested guest dialog must survive calendar Escape/Cancel; selection is shared with search.
  await page.locator('.photoButton').first().click();const journey=page.locator('.journeyModal');
  await journey.getByRole('button',{name:'Choose dates',exact:true}).click();await journey.getByTestId('stay-date-range').getByRole('button').click();
  await page.keyboard.press('Escape');await closed(page);assert.equal(await journey.isVisible(),true);
  await setStayRange(page,journey,'2026-11-30','2026-12-02');assert.equal(await journey.getByRole('button',{name:'Continue',exact:true}).isEnabled(),true);
  await journey.getByRole('button',{name:'Close',exact:true}).click();assert.match(await trigger.innerText(),/2026-11-30.*2026-12-02/);
  await trigger.click();await page.reload({waitUntil:'networkidle'});await page.locator('.searchBox').getByTestId('stay-date-range').getByRole('button').click();await page.getByTestId('stay-calendar').getByTestId('stay-calendar-cancel').click();await page.getByTestId('stay-calendar').waitFor({state:'hidden'});
  checks.push('guest_draft_reset_history_nested_month_year_leap_'+timezone);await context.close();
 }
 const {page,context}=await pageFor();await page.goto(origin+'/?api=demo');
 for(const locale of ['ru','uz','en']){
  await page.locator('.guestLanguage select').selectOption(locale);
  for(const dark of [false,true]){
   const active=await page.locator('.app').evaluate(el=>el.classList.contains('dark'));
   if(active!==dark)await page.locator('[data-theme-toggle]').click();
   for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:844});await page.locator('.searchBox').getByTestId('stay-date-range').getByRole('button').click();
    const calendar=page.getByTestId('stay-calendar');assert.equal(await calendar.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    assert.equal(await calendar.evaluate(el=>el.classList.contains('dark')),dark);
    await calendar.getByTestId('stay-calendar-save').focus();await page.keyboard.press('Tab');assert.equal(await calendar.getByTestId('stay-calendar-cancel').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Shift+Tab');assert.equal(await calendar.getByTestId('stay-calendar-save').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Escape');await closed(page);
   }
  }
 }
 checks.push('three_locales_two_themes_four_widths_focus_trap');
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Staff CRM',exact:true}).click();
 for(const role of ['front_desk','general_manager','super_admin']){
  await page.locator('.staffHead select').selectOption(role);
  await setStayRange(page,page.locator('.demoStayCalendar'),'2026-11-30','2026-12-02');
  assert.match(await page.locator('.demoStayCalendar').innerText(),/Nights: 2/);
  if(role==='general_manager'){await page.locator('.sidebar').getByRole('button',{name:'Host Desk',exact:true}).click();assert.match(await page.locator('.demoStayCalendar').innerText(),/2026-11-30/);}
  if(role==='super_admin'){await page.locator('.sidebar').getByRole('button',{name:'Admin',exact:true}).click();assert.match(await page.locator('.demoStayCalendar').innerText(),/2026-11-30/);}
 }
 checks.push('front_desk_host_admin_same_component_no_fake_occupancy');await context.close();
 const fixture=require('./fixtures/canva-core-ui.cjs'),quoteRequests=[];
 const core=await pageFor('America/Los_Angeles',async(route,u)=>{
  const json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/local-api/quotes'){
   assert.equal(route.request().method(),'POST');quoteRequests.push(route.request().postDataJSON());
   return json({quoteId:fixture.id,currency:'UZS',nights:2,totalMinor:'10000',expiresAt:'2099-01-01T00:00:00Z',lines:[]});
  }
  if(route.request().method()!=='GET'){unexpected.push('core-write:'+u.pathname);return route.abort();}
  const body=fixture.response(u.pathname,{staff:'front_desk'});
  if(u.pathname==='/local-api/workspace')body.units=[{unitId:fixture.id,ratePlanId:fixture.id,code:'Calendar-test',unitTypeName:{en:'Synthetic'},maxGuests:3,rateName:{en:'Synthetic'},currency:'UZS',baseNightlyMinor:'5000'}];
  if(body===undefined){unexpected.push(u.pathname);return route.abort();}return json(body);
 });
 await core.page.goto(origin+'/?api=local-core',{waitUntil:'networkidle'});
 const workspace=core.page.locator('#staff-booking'),calculate=workspace.locator('button[type=submit]');
 await setStayRange(core.page,workspace,'2026-11-30','2026-12-02');await calculate.click();await workspace.locator('.localAmount').waitFor();assert.equal(quoteRequests.length,1);assert.equal(quoteRequests[0].checkIn,'2026-11-30');assert.equal(quoteRequests[0].checkOut,'2026-12-02');
 await workspace.getByTestId('stay-date-range').getByRole('button').click();let calendar=core.page.getByTestId('stay-calendar');await calendar.locator('[data-date="2026-12-03"]').click();await calendar.getByTestId('stay-calendar-cancel').click();await closed(core.page);assert.equal(await workspace.locator('.localAmount').count(),1);
 await setStayRange(core.page,workspace,'2026-12-02','2026-12-04');assert.equal(await workspace.locator('.localAmount').count(),0);assert.equal(quoteRequests.length,1);
 await workspace.getByTestId('stay-date-range').getByRole('button').click();await calendar.getByTestId('stay-calendar-reset').click();await calendar.locator('[data-date="2026-12-02"]').click();await calendar.locator('[data-date="2027-01-03"]').click();assert.equal(await calendar.getByTestId('stay-calendar-save').isDisabled(),true);await calendar.getByTestId('stay-calendar-cancel').click();await closed(core.page);
 await setStayRange(core.page,workspace,'','');assert.equal(await calculate.isDisabled(),true);assert.equal(quoteRequests.length,1);await core.context.close();checks.push('core_date_body_cancel_preserves_quote_save_invalidates_max30_clear_blocks_submit');
 const live=await pageFor('UTC',async(route,u)=>{
  assert.equal(route.request().method(),'GET');const json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/api/session')return json({authenticated:true,session:{mode:'staff',userId:'fixture',role:'front_desk',organizationId:'fixture',propertyIds:['utower']}});
  if(u.pathname==='/api/frontdesk-reservations')return json({items:[
   ['before','2026-11-28','2026-11-30'],['inside','2026-11-30','2026-12-02'],['after','2026-12-02','2026-12-04'],['overlap','2026-11-29','2026-12-01']
  ].map(([id,start,end])=>({id,confirmation_code:id,status:'confirmed',check_in_date:start,check_out_date:end,first_name:id,last_name:'Synthetic',unit_status:'ready',version:1}))});
  if(['/api/service-orders','/api/property-units','/api/housekeeping-jobs','/api/maintenance-tickets'].includes(u.pathname))return json({items:[]});
  unexpected.push(u.pathname);return route.abort();
 });
 await live.page.goto(origin+'/?api=live',{waitUntil:'networkidle'});await live.page.locator('.sidebar').getByRole('button',{name:'Front Desk',exact:true}).click();
 const loaded=live.page.locator('.staffBoard');await loaded.locator('.order').first().waitFor();assert.equal(await loaded.locator('.order').count(),4);
 await setStayRange(live.page,loaded,'2026-11-30','2026-12-02');assert.equal(await loaded.locator('.order').count(),2);assert.match(await loaded.locator('.orderList').innerText(),/inside/);assert.match(await loaded.locator('.orderList').innerText(),/overlap/);
 await setStayRange(live.page,loaded,'','');assert.equal(await loaded.locator('.order').count(),4);await live.context.close();checks.push('legacy_connected_frontdesk_half_open_filter_reset_no_writes');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log(JSON.stringify({result:'pass',checks,pageErrors:0,unexpectedRequests:0,realBookingsCreated:false}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
