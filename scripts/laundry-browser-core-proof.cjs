'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function({browser,page,api,admin,identity,coreOrigin}){
 page.setDefaultTimeout(15000);
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
 const profile=randomUUID(),unit=randomUUID(),type=randomUUID(),reservation='ffffffff-ffff-4fff-8fff-'+randomUUID().slice(-12),service=randomUUID();
 await admin.query("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Laundry')",[profile,identity.profile.userId,org]);
 await admin.query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await admin.query("INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,'Laundry 101')",[unit,property,type]);
 await admin.query("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,'LAUNDRY-BROWSER','checked_in',now()-interval '1 day',now()+interval '365 days','UZS',0,'{}')",[reservation,org,property,unit,profile]);
 await admin.query(`INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind,duration_minutes) VALUES($1,$2,$3,$1::uuid::text,'{"en":"Browser laundry","ru":"Стирка браузер","uz":"Brauzer kir yuvish"}','UZS',4000000,true,'laundry',60)`,[service,org,property]);
 await page.reload();await page.locator(`[data-reservation-id="${reservation}"]`).getByRole('button',{name:'View trip',exact:true}).click();
 await page.getByTestId('guest-service-laundry').click();
 const guest=page.getByTestId('guest-laundry');await guest.getByRole('button',{name:'Open laundry',exact:true}).click();
 const catalogue=await api('services/laundry/catalog?reservationId='+reservation);assert.equal(catalogue.status,200,JSON.stringify(catalogue.body));assert.ok(catalogue.body.items.some(i=>i.id===service));
 await guest.getByLabel('Service',{exact:true}).selectOption(service);await guest.getByLabel('Number of items',{exact:true}).fill('2');
 await guest.getByLabel('Pickup (device time zone)',{exact:true}).fill(new Date(Date.now()+3600000).toISOString().slice(0,16));
 await guest.getByLabel('Preferences',{exact:true}).fill('No perfume');
 assert.equal((await api('services/laundry','POST',{}, {'Idempotency-Key':randomUUID()})).status,403);
 const created=page.waitForResponse(r=>r.url().endsWith('/services/laundry')&&r.request().method()==='POST');
 await guest.getByRole('button',{name:'Request laundry pickup',exact:true}).click();const receipt=await (await created).json(),iid=receipt.intakeId;assert.ok(iid);
 const gc=guest.locator(`[data-intake-id="${iid}"]`);await gc.getByTestId('laundry-stage').getByText('Requested',{exact:true}).waitFor();
 assert.equal((await admin.query('SELECT count(*)::int n FROM service_orders WHERE reservation_id=$1',[reservation])).rows[0].n,0);
 const web=await require('./fixtures/folio-staff-web.cjs')({coreOrigin,organizationId:org,propertyId:property,internalKey:process.env.VIEWS_INTERNAL_API_KEY});
 let context;
 try{
  context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'views_staff_session',value:'a1'.repeat(32),domain:'127.0.0.1',path:'/local-api',httpOnly:true,sameSite:'Strict'}]);
  const manager=await context.newPage();manager.setDefaultTimeout(15000);await manager.goto(web.origin+'/?staffRole=manager');await manager.locator('.staffLanguage select').selectOption('en');
  const staff=manager.getByTestId('staff-laundry'),sc=staff.locator(`[data-intake-id="${iid}"]`);
  async function readPage(action){
   const received=manager.waitForResponse(r=>new URL(r.url()).pathname==='/local-api/service-orders/laundry'&&r.request().method()==='GET');
   await action();const response=await received;assert.equal(response.status(),200,'LAUNDRY_STAFF_PAGE_HTTP_'+response.status());const body=await response.json();await response.finished();
   // Bind each navigation to its response, then wait for the page snapshot to commit.
   await manager.waitForFunction(({ids,next})=>{const root=document.querySelector('[data-testid=staff-laundry]'),buttons=[...root.querySelectorAll('button')];return buttons.find(b=>b.textContent==='Refresh')?.disabled===false&&JSON.stringify([...root.querySelectorAll('[data-intake-id]')].map(n=>n.getAttribute('data-intake-id')))===JSON.stringify(ids)&&buttons.some(b=>b.textContent==='Next page')===next;},{ids:body.items.map(i=>i.intakeId),next:!!body.nextCursor});
  }
  async function findIntake(){for(let n=0;n<100&&await sc.count()===0;n++){assert.equal(await staff.getByRole('button',{name:'Next page',exact:true}).count(),1,'LAUNDRY_INTAKE_MISSING_FROM_EXHAUSTED_PAGES');await readPage(()=>staff.getByRole('button',{name:'Next page',exact:true}).click());}assert.equal(await sc.count(),1);}
  await readPage(()=>staff.getByRole('button',{name:'Open laundry',exact:true}).click());
  await findIntake();
  await sc.getByText('Unit: Laundry 101',{exact:true}).waitFor();
  const physical='Action physically completed; items checked against inventory where available';
  async function staffAction(label,stage){await sc.getByLabel(physical,{exact:true}).check();await readPage(()=>sc.getByRole('button',{name:label,exact:true}).click());await findIntake();await sc.getByTestId('laundry-stage').getByText(stage,{exact:true}).waitFor();}
  await staffAction('Confirm collection','Items received');
  await sc.getByLabel('Item description',{exact:true}).fill('White shirt');await sc.getByLabel('Item price (UZS)',{exact:true}).fill('40000');
  await sc.getByRole('button',{name:'Add item',exact:true}).click();await sc.getByLabel('Tag (A–Z, 0–9, hyphen)',{exact:true}).nth(1).fill('002');await sc.getByLabel('Item description',{exact:true}).nth(1).fill('Trousers');await sc.getByLabel('Item price (UZS)',{exact:true}).nth(1).fill('60000');
  await sc.getByLabel('Return by (device time zone)',{exact:true}).fill(new Date(Date.now()+48*3600000).toISOString().slice(0,16));
  await readPage(()=>sc.getByRole('button',{name:'Send inventory and price',exact:true}).click());await findIntake();await sc.getByTestId('laundry-stage').getByText('Inventory awaiting approval',{exact:true}).waitFor();
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await gc.getByText('001 · White shirt · 40,000 UZS',{exact:true}).waitFor();
  assert.equal(await gc.getByRole('button',{name:'Approve inventory and price',exact:true}).isDisabled(),true);
  await gc.getByLabel('I approve the inventory, final price and charge after receipt',{exact:true}).check();
  const keys=[];await page.route(`**/guest-api/services/laundry/${iid}/actions`,async r=>{keys.push(r.request().headers()['idempotency-key']);const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');},{times:1});
  await gc.getByRole('button',{name:'Approve inventory and price',exact:true}).click();await guest.getByText('No confirmation received. Retry the same operation to check its outcome.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Back to trips',exact:true}).isDisabled(),true);
  for(const kind of ['cleaning','laundry','concierge','market'])assert.equal(await page.getByTestId('guest-service-'+kind).isDisabled(),true);assert.equal(await page.getByTestId('guest-services-back').isDisabled(),true);
  await page.context().setOffline(true);await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid=guest-laundry] button')].find(b=>b.textContent==='Retry same operation')?.disabled===true);await page.context().setOffline(false);
  await page.route(`**/guest-api/services/laundry/${iid}/actions`,async r=>{keys.push(r.request().headers()['idempotency-key']);await r.continue();},{times:1});await guest.getByRole('button',{name:'Retry same operation',exact:true}).click();await gc.getByTestId('laundry-stage').getByText('Inventory accepted',{exact:true}).waitFor();assert.equal(keys[0],keys[1]);
  const orders=(await admin.query('SELECT id,total_minor::text FROM service_orders WHERE reservation_id=$1',[reservation])).rows;assert.equal(orders.length,1);assert.equal(orders[0].total_minor,'10000000');
  await readPage(()=>staff.getByRole('button',{name:'Refresh',exact:true}).click());await findIntake();await staffAction('Start processing','Processing');await staffAction('Mark ready for return','Ready for return');await staffAction('Confirm handover to guest','Returned — confirm receipt');
  assert.equal((await admin.query('SELECT count(*)::int n FROM folio_entries WHERE source_id=$1',[orders[0].id])).rows[0].n,0);
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();const guestClaim=gc.getByTestId('laundry-claim');
  await guestClaim.getByLabel('Item tag',{exact:true}).selectOption('001');await guestClaim.getByLabel('Problem type',{exact:true}).selectOption('damaged');await guestClaim.getByLabel('Describe the problem',{exact:true}).fill('The sleeve is torn');
  await guestClaim.getByRole('button',{name:'Send concern',exact:true}).click();await guestClaim.getByText('Awaiting review',{exact:true}).waitFor();assert.equal(await gc.getByRole('button',{name:'Confirm receipt and charge',exact:true}).count(),0);
  await readPage(()=>staff.getByRole('button',{name:'Refresh',exact:true}).click());await findIntake();const staffClaim=sc.getByTestId('laundry-claim');await staffClaim.getByLabel('Staff response',{exact:true}).fill('We reviewed the sleeve. Please contact reception.');await staffClaim.getByRole('checkbox').check();await readPage(()=>staffClaim.getByRole('button',{name:'Send response',exact:true}).click());await findIntake();await staffClaim.getByText('Response received — awaiting your decision',{exact:true}).waitFor();
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await guestClaim.getByText('Response received — awaiting your decision',{exact:true}).waitFor();assert.equal(await gc.getByRole('button',{name:'Confirm receipt and charge',exact:true}).count(),0);
  await guestClaim.screenshot({path:'/tmp/views-laundry-claim-guest.png'});await staffClaim.screenshot({path:'/tmp/views-laundry-claim-staff.png'});
  await guestClaim.getByLabel('The issue is resolved or I withdraw this concern. This does not confirm receipt or a charge.',{exact:true}).check();await guestClaim.getByRole('button',{name:'Close concern',exact:true}).click();await guestClaim.getByRole('status').getByText('Closed by guest',{exact:true}).waitFor();
  assert.equal((await admin.query('SELECT count(*)::int n FROM folio_entries WHERE source_id=$1',[orders[0].id])).rows[0].n,0);
  await guest.getByRole('button',{name:'Refresh',exact:true}).click();await gc.getByLabel('All items received. I confirm the stated charge',{exact:true}).check();await gc.getByRole('button',{name:'Confirm receipt and charge',exact:true}).click();await gc.getByTestId('laundry-stage').getByText('Received and charged',{exact:true}).waitFor();
  assert.deepEqual((await admin.query('SELECT amount_minor::text FROM folio_entries WHERE source_id=$1',[orders[0].id])).rows,[{amount_minor:'10000000'}]);
  for(const p of [page,manager])assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'MOBILE_OVERFLOW');
  for(const [language,title] of [['ru','Прачечная'],['uz','Kir yuvish'],['en','Laundry']]){await page.locator('.guestLanguage select').selectOption(language);await manager.locator('.staffLanguage select').selectOption(language);await guest.getByRole('heading',{name:title,exact:true}).waitFor();await staff.getByRole('heading',{name:title,exact:true}).waitFor();}
  await page.getByRole('button',{name:'Dark',exact:true}).click();assert.ok(await page.locator('.app.dark').count());
  await page.screenshot({path:'/tmp/views-laundry-guest.png',fullPage:true});await manager.screenshot({path:'/tmp/views-laundry-staff.png',fullPage:true});
  await page.getByRole('button',{name:'Light',exact:true}).click(); // Restore shared harness theme for the remaining scenarios.
  console.log(JSON.stringify({proof:'laundry_browser_core',result:'pass',checks:['guest_request','staff_inventory','exact_revised_price','guest_consent','lost_response_same_key','offline','navigation_guard','staff_location','processing_return','claim_tag_reply_guest_resolution_no_automatic_charge','guest_receipt_one_folio_charge','mobile_390','three_languages','guest_dark'],publicEnabled:false}));
 }finally{if(context)await context.close();await web.close();}
};
