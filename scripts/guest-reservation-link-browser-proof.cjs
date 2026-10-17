'use strict';
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto');
module.exports=async function({page,api,admin,identity,coreOrigin}){
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
 const staff=randomBytes(32).toString('hex'),digest=s=>createHash('sha256').update(s).digest('hex');
 assert.equal((await admin.query('SELECT app.staff_auth_start($1,1,$2) ok',['73100000-0000-4000-8000-000000000001',digest(staff)])).rows[0].ok,true);
 const guest=randomUUID();await admin.query("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'Synthetic','Invitation')",[guest,org]);
 async function booking(){const id=randomUUID();await admin.query("INSERT INTO reservations(id,organization_id,property_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,'confirmed','2037-06-01','2037-06-03','UZS','{}')",[id,org,property,guest,'INVITE-'+id]);return id;}
 const id=await booking(),other=await booking(),key=randomUUID();
 async function staffCall(target,body,command=key,token=staff){const r=await fetch(coreOrigin+'/v1/bookings/'+target+'/guest-link',{method:'POST',headers:{'Content-Type':'application/json','X-Views-Staff-Session':token,'Idempotency-Key':command},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 assert.equal((await staffCall(id,{email:identity.profile.email},key,'bad')).status,401);
 assert.equal((await staffCall(id,{email:identity.profile.email,role:'admin'})).status,400);
 const issued=await staffCall(id,{email:identity.profile.email});assert.equal(issued.status,200);assert.equal(issued.body.delivery,'manual_handoff');
 const replay=await staffCall(id,{email:identity.profile.email});assert.equal(replay.body.token,issued.body.token);assert.equal(replay.body.expiresAt,issued.body.expiresAt);
 assert.equal((await api('reservation-link/accept','POST',{token:issued.body.token})).status,403);
 const csrf={'X-Views-Guest-Csrf':identity.csrf};
 assert.equal((await api('reservation-link/preview','GET')).status,404);
 await page.locator('#reservation-link-code').fill(issued.body.token);await page.getByRole('button',{name:'Check invitation',exact:true}).click();await page.locator('[data-testid="guest-link-preview"]').waitFor();
 assert.equal((await api('trips/'+id)).status,404); // Preview never grants access.
 for(const [locale,label] of [['ru','Подтвердить привязку брони'],['uz','Bronni bog‘lashni tasdiqlash'],['en','Confirm booking link']]){await page.locator('.guestLanguage select').selectOption(locale);await page.getByRole('button',{name:label,exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 // Apply in Core, lose response, then repeat the same command manually.
 await page.route('**/guest-api/reservation-link/accept',async route=>{await route.fetch();await route.abort('failed');},{times:1});
 await page.getByRole('button',{name:'Confirm booking link',exact:true}).click();await page.getByText('The operation was not confirmed. Retry manually with the same code.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Confirm booking link',exact:true}).click();await page.getByText('Booking linked. Your trips have been refreshed.',{exact:true}).waitFor();
 await page.locator('[data-testid="guest-trip"]').waitFor();
 assert.equal((await api('trips/'+id)).status,200);assert.equal((await api('trips/'+other)).status,404);
 assert.equal((await admin.query('SELECT user_id FROM guest_profiles WHERE id=$1',[guest])).rows[0].user_id,null);
 assert.equal((await admin.query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='guest_link.accepted'",[id])).rows[0].n,1);
 assert.equal((await admin.query("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='guest.reservation_linked'",[id])).rows[0].n,1);
 const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));assert.ok(!storage.includes(issued.body.token));
 const recovered=await fetch(coreOrigin+'/v1/bookings/'+id+'/guest-link',{headers:{'X-Views-Staff-Session':staff}});assert.equal(recovered.status,200);const status=await recovered.json();assert.equal(status.invitation.linkId,issued.body.linkId);assert.equal(status.invitation.status,'accepted');assert.equal(status.invitation.token,undefined);
 const revoke=await fetch(coreOrigin+'/v1/bookings/'+id+'/guest-link/revoke',{method:'POST',headers:{'Content-Type':'application/json','X-Views-Staff-Session':staff},body:JSON.stringify({linkId:issued.body.linkId})});assert.equal(revoke.status,200);
 assert.equal((await api('trips/'+id)).status,404);assert.equal((await api('reservation-link/accept','POST',{token:issued.body.token},csrf)).status,400);
 const fresh=await staffCall(id,{email:identity.profile.email},randomUUID());assert.equal(fresh.status,200);
 await admin.query("UPDATE guest_identity_private.reservation_links SET expires_at=now()-interval '1 second' WHERE id=$1",[fresh.body.linkId]);
 assert.equal((await api('reservation-link/preview','POST',{token:fresh.body.token},csrf)).body.error,'GUEST_LINK_INVALID');
 // A syntactically valid staff session without reservation permission remains forbidden.
 const limited=randomBytes(32).toString('hex');assert.equal((await admin.query('SELECT app.staff_auth_start($1,1,$2) ok',['74900000-0000-4000-8000-000000000001',digest(limited)])).rows[0].ok,true);
 assert.equal((await staffCall(id,{email:identity.profile.email},randomUUID(),limited)).status,403);
 await page.getByRole('button',{name:'Refresh trips',exact:true}).click();await page.getByText('No bookings are linked to this account yet.',{exact:true}).waitFor();
 console.log(JSON.stringify({result:'pass',proof:'guest_reservation_link_browser_core_postgres',checks:['authenticated_staff_issue_bound_recipient_manual_delivery','preview_without_grant_and_guest_csrf','explicit_accept_three_languages_lost_response_replay_one_audit_outbox','one_booking_not_shared_profile_revoke_expiry_no_staff_privilege'],externalEmailSent:false}));
};
