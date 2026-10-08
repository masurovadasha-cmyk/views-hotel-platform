'use strict';
// Actual guest browser + cookie gateway + Core + disposable PostgreSQL, no provider calls.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function({page,api,admin,identity}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='00000000-0000-0000-0000-000000000001',property='00000000-0000-0000-0000-000000000002';
 const profile=randomUUID(),unit=randomUUID(),id=randomUUID(),foreign=randomUUID(),csrf={'X-Views-Guest-Csrf':identity.csrf};
 const policy={version:1,propertyTimezone:'Asia/Tashkent',rules:[{minHoursBeforeCheckIn:0,refundBps:5000}],nonRefundableLineCodes:[]};
 await admin.query("INSERT INTO guest_profiles(id,organization_id,user_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Cancellation')",[profile,org,identity.profile.userId]);
 await admin.query("INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,'00000000-0000-0000-0000-000000000003',$3)",[unit,property,'CANCEL-'+unit]);
 await admin.query("INSERT INTO reservations(id,organization_id,property_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot,unit_id) VALUES($1,$2,$3,$4,$5,'confirmed','2038-06-01T09:00:00Z','2038-06-03T07:00:00Z','UZS',9007199254740993,$6,$7)",[id,org,property,profile,'CANCEL-'+id,policy,unit]);
 await admin.query("INSERT INTO inventory_periods(organization_id,property_id,unit_id,reservation_id,kind,source_ref,stay_period) VALUES($1,$2,$3,$4,'reservation',$5,tstzrange('2038-06-01T09:00:00Z','2038-06-03T07:00:00Z','[)'))",[org,property,unit,id,'guest-cancel:'+id]);
 await admin.query("INSERT INTO reservation_price_lines(reservation_id,line_type,code,label,amount_minor,currency,refundable) VALUES($1,'night','lodging','{\"en\":\"Synthetic stay\"}',9007199254740993,'UZS',true)",[id]);
 const route='trips/'+id+'/cancellation/';
 assert.equal((await api(route+'preview','GET')).status,404);
 assert.equal((await api(route+'preview','POST',{})).status,403);
 assert.equal((await api('trips/'+foreign+'/cancellation/preview','POST',{},csrf)).status,404);
 assert.equal((await api(route+'preview','POST',{actorId:identity.profile.userId},csrf)).status,400);
 await page.getByRole('button',{name:'Refresh trips',exact:true}).click();
 await page.getByRole('button',{name:'View trip',exact:true}).click();
 const panel=page.getByTestId('guest-cancellation');await panel.getByTestId('guest-cancellation-preview-button').click();
 await panel.getByTestId('guest-cancellation-preview').waitFor();
 assert.equal((await admin.query('SELECT status FROM reservations WHERE id=$1',[id])).rows[0].status,'confirmed');
 for(const locale of ['ru','uz','en']){
  await page.locator('.guestLanguage select').selectOption(locale);
  for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 }
 assert.ok((await panel.innerText()).replace(/\s/g,'').includes('90,071,992,547,409.93'));
 await admin.query("UPDATE reservations SET cancellation_policy_snapshot=jsonb_set(cancellation_policy_snapshot,'{rules,0,refundBps}','2500') WHERE id=$1",[id]);
 await panel.getByTestId('guest-cancellation-confirm').click();
 await panel.getByText('The calculation expired or changed. Get a new calculation and confirm it separately.',{exact:true}).waitFor();
 assert.equal(await panel.getByTestId('guest-cancellation-preview').count(),0);
 assert.equal((await admin.query('SELECT status FROM reservations WHERE id=$1',[id])).rows[0].status,'confirmed');
 await panel.getByTestId('guest-cancellation-preview-button').click();await panel.getByTestId('guest-cancellation-preview').waitFor();
 const writes=[];
 await page.route('**/guest-api/'+route+'confirm',async r=>{
  writes.push({body:r.request().postDataJSON(),key:r.request().headers()['idempotency-key']});
  const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');
 },{times:1});
 await panel.getByTestId('guest-cancellation-confirm').click();
 await panel.getByText('The server did not confirm the result. Keep this trip open and retry the same cancellation request manually.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Refresh trips',exact:true}).isDisabled(),true);
 await page.context().setOffline(true);assert.equal(await panel.getByTestId('guest-cancellation-confirm').isDisabled(),true);await page.context().setOffline(false);
 await page.route('**/guest-api/'+route+'confirm',async r=>{writes.push({body:r.request().postDataJSON(),key:r.request().headers()['idempotency-key']});await r.continue();},{times:1});
 await panel.getByTestId('guest-cancellation-confirm').click();await panel.getByTestId('guest-cancellation-result').waitFor();
 assert.deepEqual(writes[0],writes[1]);
 await panel.getByText('No refund is required for this cancellation.',{exact:true}).waitFor();
 const cancelled=(await admin.query('SELECT status,actor_membership_id,actor_user_id FROM reservations r JOIN booking_cancellations c ON c.reservation_id=r.id WHERE r.id=$1',[id])).rows[0];
 assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.actor_membership_id,null);assert.equal(cancelled.actor_user_id,identity.profile.userId);
 assert.equal((await admin.query('SELECT count(*)::int n FROM inventory_periods WHERE reservation_id=$1',[id])).rows[0].n,0);
 assert.equal((await admin.query('SELECT count(*)::int n FROM booking_cancellations WHERE reservation_id=$1',[id])).rows[0].n,1);
 assert.equal((await admin.query('SELECT count(*)::int n FROM organization_memberships WHERE user_id=$1',[identity.profile.userId])).rows[0].n,0);
 await page.reload();await page.getByRole('button',{name:'View trip',exact:true}).click();
 assert.equal(await page.getByTestId('guest-cancellation-confirm').count(),0);
 // Ownership revocation also denies a successful command's replay.
 await admin.query('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[profile]);
 assert.equal((await api(route+'confirm','POST',writes[0].body,{...csrf,'Idempotency-Key':writes[0].key})).status,404);
 const saved=process.env.VIEWS_GUEST_CANCELLATION_PILOT_ENABLED;process.env.VIEWS_GUEST_CANCELLATION_PILOT_ENABLED='false';
 try{assert.equal((await api(route+'preview','POST',{},csrf)).body.error,'GUEST_CANCELLATION_DISABLED');}finally{process.env.VIEWS_GUEST_CANCELLATION_PILOT_ENABLED=saved;}
 await page.getByRole('button',{name:'Refresh trips',exact:true}).click();await page.getByText('No bookings are linked to this account yet.',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});
 console.log(JSON.stringify({result:'pass',proof:'guest_cancellation_browser_core_postgres',checks:['cookie_csrf_exact_body_foreign_reservation_and_preview_without_write','three_languages_two_widths_exact_bigint_and_stale_terms','lost_reply_same_command_offline_manual_retry_one_cancellation_inventory_release','no_staff_membership_reload_revoked_ownership_and_default_off'],realPayments:false,externalRequestsSent:0}));
};
