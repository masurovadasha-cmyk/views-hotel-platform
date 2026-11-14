'use strict';
// Synthetic fixtures only. Called inside the marked disposable --demo-sms smoke.
const assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
module.exports=async function({db,origin,session}){
 const marker=await db.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()");
 assert.equal(marker.rows[0]?.marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
 const profile=randomUUID(),type=randomUUID(),unit=randomUUID(),rate=randomUUID(),quote=randomUUID(),key=randomUUID();
 await db.withOrganization(org,async c=>{
  await c.query("INSERT INTO guest_profiles(id,organization_id,user_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Hold')",[profile,org,session.userId]);
  await c.query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
  await c.query("INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4)",[unit,property,type,'SMOKE-'+unit]);
  await c.query("INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor) VALUES($1,$2,$3,'{}','UZS',10000)",[rate,property,type]);
  await c.query(`INSERT INTO booking_quotes(id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,accommodation_minor,total_minor,cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at)
   VALUES($1,$2,$3,$4,$5,'2037-10-01','2037-10-02','{}','UZS',10000,10000,'{}','{}','synthetic',now()+interval '10 minutes')`,[quote,org,property,unit,rate]);
  await c.query("INSERT INTO booking_quote_lines(quote_id,line_type,code,label,amount_minor,currency) VALUES($1,'accommodation','ROOM','{}',10000,'UZS')",[quote]);
 });
 const staffHash=createHash('sha256').update(randomBytes(32)).digest('hex');
 assert.equal((await db.query('SELECT app.staff_auth_start($1,1,$2) ok',['73100000-0000-4000-8000-000000000001',staffHash])).rows[0].ok,true);
 try{await db.query('SELECT app.issue_guest_quote($1,$2,$3)',[staffHash,quote,profile]);}
 finally{await db.query('SELECT app.staff_auth_logout($1)',[staffHash]);}
 const endpoint=origin+'/v1/guest-identity/sms/holds';
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+session.token,'Idempotency-Key':key};
 const post=body=>fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
 assert.equal((await post({quoteId:quote,ttlSeconds:1})).status,400);
 const created=await post({quoteId:quote});assert.equal(created.status,201);const hold=await created.json();
 assert.equal(hold.status,'hold');assert.equal(hold.totalMinor,'10000');assert.equal(hold.idempotentReplay,false);
 const replay=await post({quoteId:quote});assert.equal(replay.status,201);assert.deepEqual(await replay.json(),{...hold,idempotentReplay:true});
 const trips=await fetch(origin+'/v1/guest-identity/sms/trips',{headers,signal:AbortSignal.timeout(5000)});
 assert.equal(trips.status,200);assert.ok((await trips.json()).items.some(x=>x.id===hold.reservationId&&x.status==='hold'));
 console.log(JSON.stringify({guestHoldHttpSmoke:true,ownedTrip:true,replayStable:true,clientTtlDenied:true}));
};
