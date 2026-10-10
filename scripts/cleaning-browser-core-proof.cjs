'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function({browser,page,api,admin,identity,coreOrigin}){
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',id=n=>'76800000-0000-4000-8000-'+String(n).padStart(12,'0');
 const profile=randomUUID(),unit=randomUUID(),type=randomUUID(),reservation='ffffffff-'+randomUUID().slice(9),service=randomUUID();
 await admin.query("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Cleaning')",[profile,identity.profile.userId,org]);
 await admin.query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await admin.query("INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,'Synthetic cleaning browser')",[unit,property,type]);
 await admin.query("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,'CLEANING-BROWSER','checked_in',now()-interval '1 day',now()+interval '365 days','UZS',0,'{}')",[reservation,org,property,unit,profile]);
 await admin.query(`INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind,duration_minutes) VALUES($1,$2,$3,'browser-cleaning','{"en":"Browser cleaning","ru":"Уборка браузер","uz":"Brauzer tozalash"}','UZS',12345,true,'cleaning',40)`,[service,org,property]);
 await page.reload();await page.getByRole('button',{name:'View trip',exact:true}).first().click();
 const catalogue=await api('services/catalog?reservationId='+reservation);if(catalogue.status!==200)console.error('CLEANING_CATALOGUE:'+catalogue.status+':'+catalogue.body.error);assert.equal(catalogue.status,200,JSON.stringify(catalogue.body));assert.ok(catalogue.body.items.some(s=>s.id===service),'CATALOGUE_ITEM_MISSING');
 const guest=page.getByTestId('guest-cleaning');await guest.waitFor();await guest.getByLabel('Service',{exact:true}).selectOption(service);
 await guest.getByLabel('Preferred time (device time zone)').fill(new Date(Date.now()+100*3600000).toISOString().slice(0,16));await guest.getByLabel('I accept the price and folio charge',{exact:true}).check();
 const body={reservationId:reservation,serviceId:service,expectedRevision:1,expectedPriceMinor:'12345',requestedFor:new Date(Date.now()+100*3600000).toISOString()};
 assert.equal((await api('services/orders','POST',body,{'Idempotency-Key':randomUUID()})).status,403);
 const writes=[];await page.route('**/guest-api/services/orders',async r=>{writes.push(r.request().headers()['idempotency-key']);const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
 await guest.getByRole('button',{name:'Request cleaning',exact:true}).click();await guest.getByText('No confirmation received. Retry the same operation to check its outcome.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Back to trips',exact:true}).isDisabled(),true);
 await page.context().setOffline(true);assert.equal(await guest.getByRole('button',{name:'Retry same operation',exact:true}).isDisabled(),true);await page.context().setOffline(false);
 await page.route('**/guest-api/services/orders',async r=>{writes.push(r.request().headers()['idempotency-key']);await r.continue();},{times:1});
 await guest.getByRole('button',{name:'Retry same operation',exact:true}).click();await guest.getByText('Saved',{exact:true}).waitFor();if(writes[0]!==writes[1])console.error('RETRY_KEYS:'+JSON.stringify(writes));assert.equal(writes[0],writes[1]);
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
  await mp.getByRole('button',{name:'Open cleaning queue',exact:true}).click();await wp.getByRole('button',{name:'Open cleaning queue',exact:true}).click();
  const card=p=>p.locator('article').filter({hasText:'Browser cleaning'}).filter({hasNotText:'Cancelled'});
  await card(mp).getByText(/Synthetic cleaning browser/).waitFor();
  await card(mp).getByLabel('Housekeeper',{exact:true}).selectOption(id(2));await card(mp).getByRole('button',{name:'Assign',exact:true}).click();await card(mp).getByText(/Assigned/).waitFor();
  await wp.getByRole('button',{name:'Refresh',exact:true}).click();await card(wp).getByRole('button',{name:'Start',exact:true}).click();await card(wp).getByLabel('Note',{exact:true}).fill('Synthetic completed checklist');
  for(const label of ['Linen checked','Bathroom cleaned','Floor cleaned'])await card(wp).getByLabel(label,{exact:true}).check();
  await card(wp).getByRole('button',{name:'Submit for inspection',exact:true}).click();await card(wp).getByText(/Awaiting inspection/).waitFor();
  assert.equal((await admin.query('SELECT count(*)::int n FROM folio_entries WHERE source_id=$1',[oid])).rows[0].n,0);
  phase='approval';await mp.getByRole('button',{name:'Refresh',exact:true}).click();await card(mp).getByLabel('Note',{exact:true}).fill('Independent browser inspection');await card(mp).getByLabel('I confirm inspection and the stated charge',{exact:true}).check();
  await card(mp).getByRole('button',{name:'Accept and charge',exact:true}).click();await card(mp).getByText(/Accepted and charged/).waitFor();
  const entries=(await admin.query('SELECT amount_minor::text FROM folio_entries WHERE source_id=$1',[oid])).rows;assert.deepEqual(entries,[{amount_minor:'12345'}]);
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await guest.getByText(/Accepted and charged/).waitFor();
  for(const l of ['ru','uz','en']){await page.locator('.guestLanguage select').selectOption(l);await manager.locator('.staffLanguage select').selectOption(l);for(const p of [page,manager])assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.locator('.guestLanguage select').selectOption('ru');await manager.locator('.staffLanguage select').selectOption('ru');
  await guest.screenshot({path:'/tmp/views-cleaning-guest.png'});await mp.locator('article').filter({hasText:'Уборка браузер'}).filter({hasNotText:'Отменён'}).screenshot({path:'/tmp/views-cleaning-staff.png'});
  await page.locator('.guestLanguage select').selectOption('en');
  console.log(JSON.stringify({result:'pass',proof:'cleaning_guest_dispatch_worker_inspection_folio',duplicateRequests:1,folioEntries:1,csrf:true,offline:true,languages:3,guestReschedule:true,guestCancellation:true}));
 }catch(e){console.error('CLEANING_BROWSER_PHASE:'+phase);throw e;}finally{for(const c of contexts)await c.close();await web.close();}
};
