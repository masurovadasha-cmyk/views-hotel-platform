'use strict';
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto');
module.exports=async function({browser,page,api,admin,identity,coreOrigin}){
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',id=n=>'76800000-0000-4000-8000-'+String(n).padStart(12,'0');
 const profile=randomUUID(),unit=randomUUID(),type=randomUUID(),reservation='ffffffff-'+randomUUID().slice(9),service=randomUUID();
 await admin.query("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Cleaning')",[profile,identity.profile.userId,org]);
 await admin.query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await admin.query("INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,'Synthetic cleaning browser')",[unit,property,type]);
 await admin.query("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,'CLEANING-BROWSER','checked_in',now()-interval '1 day',now()+interval '365 days','UZS',0,'{}')",[reservation,org,property,unit,profile]);
 await admin.query(`INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind,duration_minutes) VALUES($1,$2,$3,'browser-cleaning','{"en":"Browser cleaning","ru":"Уборка браузер","uz":"Brauzer tozalash"}','UZS',12345,true,'cleaning',40)`,[service,org,property]);
 await page.reload();await page.locator(`[data-reservation-id="${reservation}"]`).getByRole('button',{name:'View trip',exact:true}).click();
 const services=page.getByTestId('guest-trip-services'),kinds=['cleaning','laundry','concierge','market'];await services.waitFor();
 for(const kind of kinds){assert.equal(await page.getByTestId('guest-service-'+kind).getAttribute('aria-pressed'),'false');assert.equal(await page.getByTestId('guest-service-panel-'+kind).count(),0);}
 await page.getByTestId('guest-service-cleaning').focus();await page.keyboard.press('Enter');
 assert.equal(await page.getByTestId('guest-service-cleaning').getAttribute('aria-pressed'),'true');
 const catalogue=await api('services/catalog?reservationId='+reservation);if(catalogue.status!==200)console.error('CLEANING_CATALOGUE:'+catalogue.status+':'+catalogue.body.error);assert.equal(catalogue.status,200,JSON.stringify(catalogue.body));assert.ok(catalogue.body.items.some(s=>s.id===service),'CATALOGUE_ITEM_MISSING');
 const guest=page.getByTestId('guest-cleaning');await guest.waitFor();await guest.getByLabel('Service',{exact:true}).selectOption(service);
 const draftTime=new Date(Date.now()+100*3600000).toISOString().slice(0,16);
 await guest.getByLabel('Preferred time (device time zone)').fill(draftTime);await guest.getByLabel('I accept the price and folio charge',{exact:true}).check();
 async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RESPONSE_BARRIER_TIMEOUT')),15000);})]);}finally{clearTimeout(timer);}}
 async function holdReply(path){let release,arrived;const held=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{arrived=resolve;});
  await page.route(path,async route=>{const response=await route.fetch();assert.equal(response.status(),200);arrived();await held;await route.fulfill({response});},{times:1});return {ready,release};
 }
 async function tripGuard(blocked){for(const name of ['Back to trips','Refresh trips','Request cleaning'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),blocked,name);for(const kind of kinds)assert.equal(await page.getByTestId('guest-service-'+kind).isDisabled(),blocked);
  assert.equal(await guest.getByLabel('Service',{exact:true}).isDisabled(),blocked);assert.equal(await guest.getByLabel('Service',{exact:true}).inputValue(),service);assert.equal(await guest.getByLabel('Preferred time (device time zone)').inputValue(),draftTime);assert.equal(await guest.getByLabel('I accept the price and folio charge',{exact:true}).isChecked(),true);
 }
 const linkProfile=randomUUID(),linkReservation=randomUUID(),staff=randomBytes(32).toString('hex');
 await admin.query("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'Synthetic','Pending guard')",[linkProfile,org]);
 await admin.query("INSERT INTO reservations(id,organization_id,property_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,'PENDING-GUARD','confirmed','2037-06-01','2037-06-03','UZS','{}')",[linkReservation,org,property,linkProfile]);
 assert.equal((await admin.query('SELECT app.staff_auth_start($1,1,$2) ok',['73100000-0000-4000-8000-000000000001',createHash('sha256').update(staff).digest('hex')])).rows[0].ok,true);
 const issued=await fetch(coreOrigin+'/v1/bookings/'+linkReservation+'/guest-link',{method:'POST',headers:{'Content-Type':'application/json','X-Views-Staff-Session':staff,'Idempotency-Key':randomUUID()},body:JSON.stringify({email:identity.profile.email})});assert.equal(issued.status,200);const invitation=await issued.json();
 await page.getByLabel('Invitation code',{exact:true}).fill(invitation.token);const previewHold=await holdReply('**/guest-api/reservation-link/preview');
 try{await page.getByRole('button',{name:'Check invitation',exact:true}).click();await bounded(previewHold.ready);await tripGuard(true);for(const name of ['Sign out','Check session again'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true);}finally{previewHold.release();}
 await page.getByTestId('guest-link-preview').waitFor();await tripGuard(false);
 const sessionHold=await holdReply('**/guest-api/session');
 try{await page.getByRole('button',{name:'Check session again',exact:true}).click();await bounded(sessionHold.ready);await tripGuard(true);assert.equal(await page.getByLabel('Invitation code',{exact:true}).isDisabled(),true);for(const button of await page.locator('.guestEmailCard button').all())assert.equal(await button.isDisabled(),true);}finally{sessionHold.release();}
 await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();await tripGuard(false);assert.equal(await page.getByLabel('Invitation code',{exact:true}).inputValue(),invitation.token);assert.equal(await page.getByTestId('guest-link-preview').count(),1);
 const outerRequests=[];const recordOuter=r=>{if(/\/guest-api\/(logout|session|reservation-link\/(preview|accept))$/.test(r.url()))outerRequests.push(r.url());};page.on('request',recordOuter);
 async function outerGuard(blocked){
  for(const name of ['Sign out','Check session again','Check invitation','Confirm booking link']){const button=page.getByRole('button',{name,exact:true});assert.equal(await button.isDisabled(),blocked,name);if(blocked)await button.evaluate(b=>b.click());}
  const input=page.getByLabel('Invitation code',{exact:true});assert.equal(await input.isDisabled(),blocked);assert.equal(await input.inputValue(),invitation.token);
  if(blocked)await input.evaluate(e=>e.form.requestSubmit());
  assert.equal(await page.getByTestId('guest-link-preview').count(),1);assert.equal(await page.getByTestId('guest-identity').textContent(),identity.profile.email);assert.equal(await guest.isVisible(),true);assert.deepEqual(outerRequests,[]);
 }
 await page.getByTestId('guest-service-laundry').click();assert.equal(await guest.isVisible(),false);assert.equal(await page.getByTestId('guest-laundry').isVisible(),true);
 assert.equal(await page.getByTestId('guest-service-cleaning').getAttribute('aria-pressed'),'false');assert.equal(await page.getByTestId('guest-service-laundry').getAttribute('aria-pressed'),'true');
 await page.getByTestId('guest-services-back').click();for(const kind of ['cleaning','laundry'])assert.equal(await page.getByTestId('guest-service-panel-'+kind).isVisible(),false);
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-testid')),'guest-service-laundry');
 await page.getByTestId('guest-service-cleaning').click();assert.equal(await guest.getByLabel('Service',{exact:true}).inputValue(),service);
 assert.equal(await guest.getByLabel('Preferred time (device time zone)').inputValue(),draftTime);assert.equal(await guest.getByLabel('I accept the price and folio charge',{exact:true}).isChecked(),true);
 assert.equal((await admin.query('SELECT count(*)::int n FROM service_orders WHERE reservation_id=$1',[reservation])).rows[0].n,0);
 const body={reservationId:reservation,serviceId:service,expectedRevision:1,expectedPriceMinor:'12345',requestedFor:new Date(Date.now()+100*3600000).toISOString()};
 assert.equal((await api('services/orders','POST',body,{'Idempotency-Key':randomUUID()})).status,403);
 const command=r=>({key:r.request().headers()['idempotency-key'],body:r.request().postDataJSON()}),writes=[];
 let release,committed;const hold=new Promise(resolve=>{release=resolve;}),serverCommitted=new Promise(resolve=>{committed=resolve;});
 await page.route('**/guest-api/services/orders',async r=>{writes.push(command(r));const response=await r.fetch();assert.equal(response.status(),200);committed();await hold;await r.abort('failed');},{times:1});
 try{await guest.getByRole('button',{name:'Request cleaning',exact:true}).click();await bounded(serverCommitted);await outerGuard(true);}finally{release();}
 await guest.getByText('No confirmation received. Retry the same operation to check its outcome.',{exact:true}).waitFor();await outerGuard(true);
 assert.equal(await page.getByRole('button',{name:'Back to trips',exact:true}).isDisabled(),true);
 for(const kind of kinds)assert.equal(await page.getByTestId('guest-service-'+kind).isDisabled(),true);
 assert.equal(await page.getByTestId('guest-services-back').isDisabled(),true);
 await page.context().setOffline(true);assert.equal(await guest.getByRole('button',{name:'Retry same operation',exact:true}).isDisabled(),true);await outerGuard(true);await page.context().setOffline(false);
 await page.route('**/guest-api/services/orders',async r=>{writes.push(command(r));await r.continue();},{times:1});
 await guest.getByRole('button',{name:'Retry same operation',exact:true}).click();await guest.getByText('Saved',{exact:true}).waitFor();assert.deepEqual(writes[0],writes[1]);await outerGuard(false);
 for(const kind of kinds)assert.equal(await page.getByTestId('guest-service-'+kind).isDisabled(),false);
 const orders=(await admin.query('SELECT id FROM service_orders WHERE reservation_id=$1',[reservation])).rows;assert.equal(orders.length,1);const oid=orders[0].id;
 // Guest change review, CSRF, current plan in Core, then a separate cancelled
 // order. The original order continues through worker execution below.
 const changes=guest.getByTestId('guest-cleaning-change');
 assert.equal((await api('services/orders/'+oid+'/actions','POST',{action:'cancel',expectedRevision:1},{'Idempotency-Key':randomUUID()})).status,403);
 await changes.getByRole('button',{name:'Change time',exact:true}).click();
 const moved=new Date(Date.now()+110*3600000).toISOString().slice(0,16);
 await changes.getByLabel('Preferred time (device time zone)',{exact:true}).fill(moved);
 assert.equal(await changes.getByRole('button',{name:'Confirm change',exact:true}).isDisabled(),true);
 await changes.getByLabel('I confirm this change',{exact:true}).check();
 const changedResponse=page.waitForResponse(r=>r.url().endsWith('/services/orders/'+oid+'/actions')&&r.request().method()==='POST');
 await changes.getByRole('button',{name:'Confirm change',exact:true}).click();assert.equal((await changedResponse).status(),200);
 await changes.getByRole('button',{name:'Change time',exact:true}).waitFor();
 assert.equal(new Date((await admin.query('SELECT lower(scheduled_period) current_time FROM service_cleaning_tasks WHERE order_id=$1',[oid])).rows[0].current_time).toISOString(),new Date(moved).toISOString());
 await guest.getByLabel('Service',{exact:true}).selectOption(service);
 await guest.getByLabel('Preferred time (device time zone)',{exact:true}).fill(new Date(Date.now()+120*3600000).toISOString().slice(0,16));
 await guest.getByLabel('I accept the price and folio charge',{exact:true}).check();
 const createdResponse=page.waitForResponse(r=>r.url().endsWith('/services/orders')&&r.request().method()==='POST');
 await guest.getByRole('button',{name:'Request cleaning',exact:true}).click();const second=(await (await createdResponse).json()).orderId;
 await page.waitForFunction(()=>document.querySelectorAll('[data-testid="guest-cleaning-change"]').length===2);
 const cancelCard=guest.locator('article[data-order-id="'+second+'"]');
 await cancelCard.getByRole('button',{name:'Cancel before start',exact:true}).click();
 await cancelCard.getByText(/Cancellation is free before cleaning starts/).waitFor();
 await cancelCard.getByLabel('I confirm this change',{exact:true}).check();
 const cancelResponse=page.waitForResponse(r=>r.url().endsWith('/services/orders/'+second+'/actions')&&r.request().method()==='POST');
 await cancelCard.getByRole('button',{name:'Confirm change',exact:true}).click();assert.equal((await cancelResponse).status(),200);
 await cancelCard.getByText(/Cancelled/).waitFor();
 assert.equal((await admin.query('SELECT count(*)::int n FROM folio_entries WHERE source_id=$1',[second])).rows[0].n,0);
 const web=await require('./fixtures/folio-staff-web.cjs')({coreOrigin,organizationId:org,propertyId:property,internalKey:process.env.VIEWS_INTERNAL_API_KEY});
 const contexts=[];let phase='staff';
 try{
  async function employee(n,role){const context=await browser.newContext({viewport:{width:390,height:900}});contexts.push(context);await context.addCookies([{name:'views_staff_session',value:('a'+n).repeat(32),domain:'127.0.0.1',path:'/local-api',httpOnly:true,sameSite:'Strict'}]);const p=await context.newPage();p.setDefaultTimeout(15000);await p.goto(web.origin+'/?staffRole='+role);await p.locator('.staffLanguage select').selectOption('en');return p;}
  const manager=await employee(1,'manager'),worker=await employee(2,'housekeeper');
  const mp=manager.getByTestId('staff-cleaning'),wp=worker.getByTestId('staff-cleaning');
  const card=p=>p.locator(`article[data-order-id="${oid}"]`);
  async function readPage(p,action){
   const view=p===mp?manager:worker,received=view.waitForResponse(r=>new URL(r.url()).pathname==='/local-api/service-orders'&&r.request().method()==='GET');
   await action();const response=await received;assert.equal(response.status(),200,'CLEANING_STAFF_PAGE_HTTP_'+response.status());const body=await response.json();await response.finished();
   // Match the committed DOM page to this GET before looking for the exact order.
   await view.waitForFunction(({ids,next})=>{const root=document.querySelector('[data-testid=staff-cleaning]'),buttons=[...root.querySelectorAll('button')];return buttons.find(b=>b.textContent==='Refresh')?.disabled===false&&JSON.stringify([...root.querySelectorAll('[data-order-id]')].map(n=>n.getAttribute('data-order-id')))===JSON.stringify(ids)&&buttons.some(b=>b.textContent==='Next page')===next;},{ids:body.items.map(i=>i.orderId),next:!!body.nextCursor});
  }
  async function findOrder(p){for(let n=0;n<100&&await card(p).count()===0;n++){assert.equal(await p.getByRole('button',{name:'Next page',exact:true}).count(),1,'CLEANING_ORDER_MISSING_FROM_EXHAUSTED_PAGES');await readPage(p,()=>p.getByRole('button',{name:'Next page',exact:true}).click());}assert.equal(await card(p).count(),1,'CLEANING_ORDER_NOT_FOUND_WITHIN_PAGE_LIMIT');}
  async function queue(p,action){await readPage(p,action);await findOrder(p);}
  await queue(mp,()=>mp.getByRole('button',{name:'Open cleaning queue',exact:true}).click());await readPage(wp,()=>wp.getByRole('button',{name:'Open cleaning queue',exact:true}).click());
  await card(mp).getByText(/Synthetic cleaning browser/).waitFor();
  await card(mp).getByLabel('Housekeeper',{exact:true}).selectOption(id(2));await queue(mp,()=>card(mp).getByRole('button',{name:'Assign',exact:true}).click());await card(mp).getByText(/Assigned/).waitFor();
  await queue(wp,()=>wp.getByRole('button',{name:'Refresh',exact:true}).click());await queue(wp,()=>card(wp).getByRole('button',{name:'Start',exact:true}).click());await card(wp).getByLabel('Note',{exact:true}).fill('Synthetic completed checklist');
  for(const label of ['Linen checked','Bathroom cleaned','Floor cleaned'])await card(wp).getByLabel(label,{exact:true}).check();
  await queue(wp,()=>card(wp).getByRole('button',{name:'Submit for inspection',exact:true}).click());await card(wp).getByText(/Awaiting inspection/).waitFor();
  assert.equal((await admin.query('SELECT count(*)::int n FROM folio_entries WHERE source_id=$1',[oid])).rows[0].n,0);
  phase='approval';await queue(mp,()=>mp.getByRole('button',{name:'Refresh',exact:true}).click());await card(mp).getByLabel('Note',{exact:true}).fill('Independent browser inspection');await card(mp).getByLabel('I confirm inspection and the stated charge',{exact:true}).check();
  await queue(mp,()=>card(mp).getByRole('button',{name:'Accept and charge',exact:true}).click());await card(mp).getByText(/Accepted and charged/).waitFor();
  const entries=(await admin.query('SELECT amount_minor::text FROM folio_entries WHERE source_id=$1',[oid])).rows;assert.deepEqual(entries,[{amount_minor:'12345'}]);
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await guest.getByText(/Accepted and charged/).waitFor();
  const finished=guest.locator('article[data-order-id="'+oid+'"]');
  assert.equal((await api('services/orders/'+oid+'/feedback','POST',{rating:5,comment:''},{'Idempotency-Key':randomUUID()})).status,403);
  await finished.getByLabel('Service rating',{exact:true}).selectOption('5');
  await finished.getByLabel('Comment (optional)',{exact:true}).fill('<b>Friendly team</b>');
  const feedbackKeys=[];
  await page.route('**/guest-api/services/orders/'+oid+'/feedback',async r=>{feedbackKeys.push(command(r));const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
  await finished.getByRole('button',{name:'Submit rating',exact:true}).click();
  await guest.getByText('No confirmation received. Retry the same operation to check its outcome.',{exact:true}).waitFor();await outerGuard(true);
  await page.context().setOffline(true);await outerGuard(true);assert.equal(await guest.getByRole('button',{name:'Retry same operation',exact:true}).isDisabled(),true);await page.context().setOffline(false);
  await page.route('**/guest-api/services/orders/'+oid+'/feedback',async r=>{feedbackKeys.push(command(r));await r.continue();},{times:1});
  await guest.getByRole('button',{name:'Retry same operation',exact:true}).click();
  await finished.getByTestId('service-feedback-saved').waitFor();assert.deepEqual(feedbackKeys[0],feedbackKeys[1]);await outerGuard(false);
  assert.equal((await admin.query('SELECT count(*)::int n FROM service_order_feedback WHERE order_id=$1',[oid])).rows[0].n,1);page.off('request',recordOuter);
  assert.equal(await finished.locator('b').count(),0);
  await queue(mp,()=>mp.getByRole('button',{name:'Refresh',exact:true}).click());await card(mp).getByText('<b>Friendly team</b>',{exact:true}).waitFor();
  await admin.query('UPDATE service_catalog SET price_minor=24567 WHERE id=$1',[service]);
  await finished.getByRole('button',{name:'Repeat at current price',exact:true}).click();
  await page.waitForFunction(()=>{const select=document.querySelector('[data-testid="guest-cleaning"] select');return select?.selectedOptions[0]?.textContent.includes('245.67');});
  assert.equal(await guest.getByLabel('I accept the price and folio charge',{exact:true}).isChecked(),false);
  assert.equal(await guest.getByLabel('Preferred time (device time zone)',{exact:true}).inputValue(),'');
  assert.equal((await admin.query('SELECT count(*)::int n FROM service_orders WHERE reservation_id=$1',[reservation])).rows[0].n,2);
  await admin.query("UPDATE reservations SET status='checked_out' WHERE id=$1",[reservation]);
  await page.reload();await page.locator(`[data-reservation-id="${reservation}"]`).getByRole('button',{name:'View trip',exact:true}).click();await page.getByTestId('guest-service-cleaning').click();
  await guest.getByText('Service history for a completed stay. New orders and rescheduling are unavailable.',{exact:true}).waitFor();
  assert.equal(await guest.getByRole('button',{name:'Request cleaning',exact:true}).count(),0);
  await guest.getByTestId('service-feedback-saved').waitFor();
  for(const l of ['ru','uz','en']){await page.locator('.guestLanguage select').selectOption(l);await manager.locator('.staffLanguage select').selectOption(l);for(const p of [page,manager])assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.locator('.guestLanguage select').selectOption('ru');await manager.locator('.staffLanguage select').selectOption('ru');
  await guest.screenshot({path:'/tmp/views-cleaning-guest.png'});await card(mp).screenshot({path:'/tmp/views-cleaning-staff.png'});
  await page.getByTestId('guest-services-back').click();await services.screenshot({path:'/tmp/views-guest-services-light.png'});
  await page.getByRole('button',{name:'Тёмная тема',exact:true}).click();await services.screenshot({path:'/tmp/views-guest-services-dark.png'});await page.getByRole('button',{name:'Светлая тема',exact:true}).click();
  await page.locator('.guestLanguage select').selectOption('en');
  const otherReservation=randomUUID();await admin.query("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,'CLEANING-OTHER','checked_out',now()-interval '1 hour',now()-interval '30 minutes','UZS',0,'{}')",[otherReservation,org,property,unit,profile]);
  await page.getByRole('button',{name:'Back to trips',exact:true}).click();await page.locator(`[data-reservation-id="${otherReservation}"]`).getByRole('button',{name:'View trip',exact:true}).click();await services.waitFor();
  for(const kind of kinds)assert.equal(await page.getByTestId('guest-service-panel-'+kind).count(),0);
  await page.getByTestId('guest-service-cleaning').click();await guest.getByText('Service history for a completed stay. New orders and rescheduling are unavailable.',{exact:true}).waitFor();assert.equal(await guest.locator('[data-order-id]').count(),0);
  let invalidSessionCleared=false;
  if(process.env.VIEWS_CLEANING_BROWSER_ONLY==='true'){
   phase='pending_session_invalid';await admin.query("UPDATE reservations SET status='checked_in',check_out_at=now()+interval '365 days' WHERE id=$1",[otherReservation]);
   await page.reload();await page.locator(`[data-reservation-id="${otherReservation}"]`).getByRole('button',{name:'View trip',exact:true}).click();await page.getByTestId('guest-service-cleaning').click();
   await guest.getByLabel('Service',{exact:true}).selectOption(service);await guest.getByLabel('Preferred time (device time zone)').fill(draftTime);await guest.getByLabel('I accept the price and folio charge',{exact:true}).check();const expiredCommands=[];
   await page.route('**/guest-api/services/orders',async r=>{expiredCommands.push(command(r));const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
   await guest.getByRole('button',{name:'Request cleaning',exact:true}).click();await guest.getByText('No confirmation received. Retry the same operation to check its outcome.',{exact:true}).waitFor();assert.equal((await api('logout','POST',{}, {'X-Views-Guest-Csrf':identity.csrf})).status,200);
   await page.route('**/guest-api/services/orders',async r=>{expiredCommands.push(command(r));await r.continue();},{times:1});const denied=page.waitForResponse(r=>r.url().endsWith('/services/orders')&&r.request().method()==='POST');
   await guest.getByRole('button',{name:'Retry same operation',exact:true}).click();assert.equal((await denied).status(),401);await page.getByLabel('Email address',{exact:true}).waitFor();assert.deepEqual(expiredCommands[0],expiredCommands[1]);assert.equal(await page.getByTestId('guest-identity').count(),0);assert.equal(await page.locator('.guestTrips').count(),0);
   assert.equal((await admin.query('SELECT count(*)::int n FROM service_orders WHERE reservation_id=$1',[otherReservation])).rows[0].n,1);invalidSessionCleared=true;
  }
  console.log(JSON.stringify({result:'pass',proof:'cleaning_guest_dispatch_worker_inspection_folio',duplicateRequests:1,folioEntries:1,csrf:true,offline:true,languages:3,guestReschedule:true,guestCancellation:true,feedbackReplay:true,repeatCurrentPrice:true,historyAfterCheckout:true,invalidSessionCleared,outerPendingGuard:['held_invitation_preview','held_session_refresh','inflight_create','unknown_create','unknown_feedback','offline','same_key_body','retained_invitation_preview','no_outer_requests'],serviceNavigation:['lazy_overview','keyboard','one_visible_panel','retained_draft','unknown_result_guard','same_key_retry','light_dark','other_trip_reset']}));
 }catch(e){console.error('CLEANING_BROWSER_PHASE:'+phase);throw e;}finally{for(const c of contexts)await c.close();await web.close();}
};
