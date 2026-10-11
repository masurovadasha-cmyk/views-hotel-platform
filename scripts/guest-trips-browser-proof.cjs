'use strict';
// All rows are disposable synthetic bookings, never production inventory.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function({page,api,admin,identity}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='00000000-0000-0000-0000-000000000001',org2='10000000-0000-4000-8000-000000000001';
 const property='00000000-0000-0000-0000-000000000002',property2='10000000-0000-4000-8000-000000000002';
 await page.getByText('No bookings are linked to this account yet.',{exact:true}).waitFor();
 async function profile(userId,tenant,email){const id=randomUUID();await admin.query("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name,email) VALUES($1,$2,$3,'Synthetic','Trips',$4)",[id,userId,tenant,email]);return id;}
 async function book(guest,tenant,place){const id=randomUUID();await admin.query(`INSERT INTO reservations(id,organization_id,property_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot,quote_snapshot)
 VALUES($1,$2,$3,$4,$5,'confirmed','2037-05-01T12:00:00.123456Z','2037-05-03T12:00:00.123456Z','UZS',9007199254740993,'{"privatePolicy":"hidden"}','{"internal":"hidden"}')`,[id,tenant,place,guest,'SYNTHETIC-'+id]);return id;}
 const own=await profile(identity.profile.userId,org,identity.profile.email),second=await profile(identity.profile.userId,org2,identity.profile.email),ids=[];
 for(let i=0;i<21;i++)ids.push(await book(own,org,property));ids.push(await book(second,org2,property2));
 const unlinked=await book(await profile(null,org,identity.profile.email),org,property),mismatch=await book(second,org,property);
 const other=(await admin.query("INSERT INTO users(email) VALUES($1) RETURNING id",['other-trip-'+randomUUID()+'@views.invalid'])).rows[0].id;
 const foreign=await book(await profile(other,org,'other@views.invalid'),org,property);
 await page.getByRole('button',{name:'Refresh trips',exact:true}).click();await page.locator('[data-testid="guest-trip"]').first().waitFor();
 assert.equal(await page.locator('[data-testid="guest-trip"]').count(),20);
 assert.ok((await page.locator('.guestTrips').textContent()).includes('90,071,992,547,409.93 UZS'));
 const first=await api('trips');assert.equal(first.status,200);assert.equal(first.body.items.length,20);assert.ok(first.body.nextCursor);
 const allowed=['checkInAt','checkOutAt','confirmationCode','currency','id','property','status','totalMinor'].sort();
 for(const t of first.body.items)assert.deepEqual(Object.keys(t).sort(),allowed);
 assert.ok(!JSON.stringify(first.body).includes('hidden'));
 for(const id of [foreign,unlinked,mismatch,randomUUID()]){const response=await api('trips/'+id);assert.equal(response.status,404);assert.equal(response.body.error,'GUEST_TRIP_NOT_FOUND');}
 assert.equal((await api('trips?userId='+other)).status,404);
 assert.equal((await api('trips?cursor=invalid')).status,400);
 const next=await api('trips?cursor='+first.body.nextCursor);assert.equal(next.body.items.length,2);assert.equal(next.body.nextCursor,null);
 assert.deepEqual([...first.body.items,...next.body.items].map(i=>i.id),ids.sort().reverse());
 await page.getByRole('button',{name:'Next trips',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-testid="guest-trip"]').length===2);
 await page.getByRole('button',{name:'View trip',exact:true}).first().click();await page.locator('[data-testid="guest-trip-detail"]').waitFor();
 const texts={ru:'Мои поездки',uz:'Safarlarim',en:'My trips'};
 for(const [locale,title] of Object.entries(texts)){
  await page.locator('.guestLanguage select').selectOption(locale);await page.getByRole('heading',{name:title,exact:true}).waitFor();
  for(const width of [390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Back to trips',exact:true}).click();
 await page.locator('[data-testid="guest-trip"]').first().waitFor();
 // Simulated transport outage is explicitly a negative path; successful reads above use real Core.
 await page.route('**/guest-api/trips',route=>route.abort('failed'),{times:1});
 await page.getByRole('button',{name:'Refresh trips',exact:true}).click();await page.getByText('Could not load trips. Try again.',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-testid="guest-trip"]').count(),0);
 await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('[data-testid="guest-trip"]').first().waitFor();
 // Unlinking a profile removes its trips on the next real Core read.
 await admin.query('UPDATE guest_profiles SET user_id=NULL WHERE id=ANY($1::uuid[])',[[own,second]]);
 await page.getByRole('button',{name:'Refresh trips',exact:true}).click();await page.getByText('No bookings are linked to this account yet.',{exact:true}).waitFor();
 assert.equal((await api('trips/'+ids[0])).status,404);
 const old=process.env.VIEWS_GUEST_TRIPS_PILOT_ENABLED;process.env.VIEWS_GUEST_TRIPS_PILOT_ENABLED='false';
 try{assert.equal((await api('trips')).body.error,'GUEST_TRIPS_DISABLED');}finally{process.env.VIEWS_GUEST_TRIPS_PILOT_ENABLED=old;}
 console.log(JSON.stringify({result:'pass',proof:'guest_owned_trips_browser_core_postgres',checks:['empty_then_linked_only_no_email_match_no_cross_tenant_or_foreign_detail','microsecond_keyset_pages_and_exact_money','real_detail_three_languages_two_widths','read_failure_manual_retry_unlink_revocation_default_off'],syntheticBookingsOnly:true}));
};
