'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function({browser,page,api,admin,identity,coreOrigin}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
 const profile=randomUUID(),unit=randomUUID(),type=randomUUID(),reservation='ffffffff-ffff-4fff-8fff-'+randomUUID().slice(-12),service=randomUUID();
 await admin.query("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Concierge')",[profile,identity.profile.userId,org]);
 await admin.query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await admin.query("INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,'Concierge 201')",[unit,property,type]);
 await admin.query("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,'CONCIERGE-BROWSER','checked_in',now()-interval '1 day',now()+interval '5 days','UZS',0,'{}')",[reservation,org,property,unit,profile]);
 await admin.query("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind) VALUES($1,$2,$3,$1::uuid::text,'{\"en\":\"Concierge\"}','UZS',0,true,'concierge')",[service,org,property]);
 await page.locator('.guestLanguage select').selectOption('en');await page.reload();await page.locator(`[data-reservation-id="${reservation}"]`).getByRole('button',{name:'View trip',exact:true}).click();
 const guest=page.getByTestId('guest-concierge');await guest.getByRole('button',{name:'Open requests',exact:true}).click();
 await guest.getByLabel('Requested time (your device time zone)',{exact:true}).fill(new Date(Date.now()+3600000).toISOString().slice(0,16));
 await guest.getByLabel('Budget, stay currency',{exact:true}).fill('300000');await guest.getByLabel('Message',{exact:true}).fill('A quiet Italian restaurant for two');
 assert.equal(await guest.getByRole('button',{name:'Confirm request',exact:true}).isDisabled(),true);
 await guest.getByLabel('I understand this is a request for assistance, not a paid booking.',{exact:true}).check();
 assert.equal((await api('services/concierge','POST',{}, {'Idempotency-Key':randomUUID()})).status,403);
 const keys=[];await page.route('**/guest-api/services/concierge',async r=>{keys.push(r.request().headers()['idempotency-key']);const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
 await guest.getByRole('button',{name:'Confirm request',exact:true}).click();await guest.getByText('Result unknown. Retry the same command manually.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Back to trips',exact:true}).isDisabled(),true);
 await page.context().setOffline(true);await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="guest-concierge"] button')].find(b=>b.textContent==='Retry same command')?.disabled===true);await page.context().setOffline(false);
 await page.route('**/guest-api/services/concierge',async r=>{keys.push(r.request().headers()['idempotency-key']);await r.continue();},{times:1});await guest.getByRole('button',{name:'Retry same command',exact:true}).click();
 await guest.locator('.conciergeStatus').getByText('Waiting for staff',{exact:true}).waitFor();assert.equal(keys[0],keys[1]);
 const rows=(await admin.query('SELECT id,total_minor::text FROM service_orders WHERE reservation_id=$1',[reservation])).rows;assert.equal(rows.length,1);const oid=rows[0].id;assert.equal(rows[0].total_minor,'0');
 let gc=guest.locator(`[data-concierge-id="${oid}"]`);const web=await require('./fixtures/folio-staff-web.cjs')({coreOrigin,organizationId:org,propertyId:property,internalKey:process.env.VIEWS_INTERNAL_API_KEY});let context;
 try{
  context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'views_staff_session',value:'a6'.repeat(32),domain:'127.0.0.1',path:'/local-api',httpOnly:true,sameSite:'Strict'}]);
  const worker=await context.newPage();worker.setDefaultTimeout(15000);await worker.goto(web.origin+'/?staffRole=concierge');await worker.locator('.staffLanguage select').selectOption('en');
  const staff=worker.getByTestId('staff-concierge');await staff.getByRole('button',{name:'Open requests',exact:true}).click();const sc=staff.locator(`[data-concierge-id="${oid}"]`);
  async function ready(){await worker.waitForFunction(()=>[...document.querySelectorAll('[data-testid="staff-concierge"] button')].find(b=>b.textContent==='Refresh')?.disabled===false);}
  async function findOrder(){await ready();for(let n=0;n<50&&await sc.count()===0;n++){await staff.getByRole('button',{name:'Next page',exact:true}).click();await ready();}assert.equal(await sc.count(),1);}
  await findOrder();
  await sc.getByRole('button',{name:'Take request',exact:true}).click();await staff.getByText('Saved',{exact:true}).waitFor();await ready();await findOrder();await sc.getByLabel('Message',{exact:true}).fill('Two restaurant options are available. Please contact us to confirm.');
  await sc.getByLabel('I checked the details; this response does not charge the guest.',{exact:true}).check();await sc.getByRole('button',{name:'Send result',exact:true}).click();await staff.getByText('Saved',{exact:true}).waitFor();await ready();await findOrder();await sc.locator('.conciergeStatus').getByText('Response received',{exact:true}).waitFor();
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await gc.getByText('Two restaurant options are available. Please contact us to confirm.',{exact:true}).waitFor();
  for(const language of ['ru','uz','en']){await page.locator('.guestLanguage select').selectOption(language);await worker.locator('.staffLanguage select').selectOption(language);for(const p of [page,worker])assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await guest.screenshot({path:'/tmp/views-concierge-guest.png'});
  await page.getByRole('button',{name:'Dark',exact:true}).click();await guest.screenshot({path:'/tmp/views-concierge-guest-dark.png'});await page.getByRole('button',{name:'Light',exact:true}).click();await staff.screenshot({path:'/tmp/views-concierge-staff.png'});
  await gc.getByRole('button',{name:'Resolved — close request',exact:true}).click();await gc.locator('.conciergeStatus').getByText('Closed by guest',{exact:true}).waitFor();
  await page.reload();await page.locator(`[data-reservation-id="${reservation}"]`).getByRole('button',{name:'View trip',exact:true}).click();await guest.getByRole('button',{name:'Open requests',exact:true}).click();await guest.locator('.conciergeStatus').getByText('Closed by guest',{exact:true}).waitFor();
  assert.equal((await admin.query('SELECT count(*)::int n FROM folio_entries WHERE source_id=$1',[oid])).rows[0].n,0);
  const projected=(await api('services/concierge?reservationId='+reservation)).body.items[0];assert.equal(projected.assigned_membership_id,undefined);assert.equal(projected.messages.length,2);
  console.log(JSON.stringify({proof:'concierge_browser_core',result:'pass',checks:['guest_request_consent','csrf','lost_reply_same_key_one_request','offline_navigation_guard','actual_concierge_claim_answer','guest_result_close_reload','no_folio_charge','three_languages_mobile'],externalBookings:false}));
 }finally{if(context)await context.close();await web.close();}
};
