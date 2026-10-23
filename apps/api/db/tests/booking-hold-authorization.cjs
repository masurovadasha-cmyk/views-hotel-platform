'use strict';
const assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {Client}=require('pg');
const {BookingHoldService}=require('../../dist/booking/booking-hold.service.js');
// Only this administrative proof receives the existing disposable owner connection.
module.exports=async function({admin,runtimeUrl}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
 const q=(sql,args=[])=>admin.query(sql,args);
 async function fixture(){
  const who=randomUUID(),unit=randomUUID(),type=randomUUID(),rate=randomUUID(),quote=randomUUID(),key=randomUUID(),token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
  await q("INSERT INTO users(id,email,display_name) VALUES($1,$1::uuid::text||'@views.invalid','Synthetic hold recovery')",[who]);
  await q("INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status) SELECT $1,$2,$1,id,'active' FROM roles WHERE code='front_desk'",[who,org]);
  await q('INSERT INTO membership_property_scopes(membership_id,property_id) VALUES($1,$2)',[who,property]);
  await q("INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) SELECT $1,password_hash,'local_fixture' FROM staff_private.credentials WHERE membership_id='73100000-0000-4000-8000-000000000001'",[who]);
  await q('INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id) SELECT $2,id,1,role_id FROM organization_memberships WHERE id=$1',[who,hash]);
  await q("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
  await q('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[unit,property,type]);
  await q("INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor) VALUES($1,$2,$3,'{}','UZS',100)",[rate,property,type]);
  await q("INSERT INTO booking_quotes(id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,accommodation_minor,total_minor,cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at) VALUES($1,$2,$3,$4,$5,'2042-05-01T09:00:00Z','2042-05-02T07:00:00Z','{}','UZS',100,100,'{}','{}',$1::uuid::text,clock_timestamp()+interval '1 hour')",[quote,org,property,unit,rate]);
  return {who,unit,hash,input:{actor:{organizationId:org,userId:who,membershipId:who,requestId:randomUUID()},quoteId:quote,idempotencyKey:key,staffSession:token,propertyId:property}};
 }
 const snapshot=async f=>(await q(`SELECT
  (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') FROM reservations r WHERE idempotency_key=$1) reservations,
  (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM booking_commands c WHERE idempotency_key=$1) commands,
  (SELECT count(*)::int FROM inventory_periods WHERE unit_id=$2) periods,
  (SELECT count(*)::int FROM booking_state_events WHERE idempotency_key=$1) events,
  (SELECT count(*)::int FROM outbox_events WHERE idempotency_key='outbox:'||$1) outbox`,[f.input.idempotencyKey,f.unit])).rows[0];
 const cases=[];for(const cached of [false,true])for(const revoke of ['session','role','scope','membership'])cases.push({cached,revoke,lock:'command'});
 for(const revoke of ['session','role','scope'])cases.push({cached:false,revoke,lock:'inventory'});
 for(const revoke of ['session','role','scope'])cases.push({cached:true,revoke,lock:'reservation'});
 for(const {cached,revoke,lock} of cases){
  const f=await fixture(),caller=new Client({connectionString:runtimeUrl}),locker=new Client({connectionString:runtimeUrl});let pending;
  try{
   for(const c of [caller,locker]){await c.connect();assert.deepEqual((await c.query('SELECT current_user role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],{role:'views_app',rolsuper:false,rolbypassrls:false});await c.query("SET statement_timeout='5s'");}
   const db={withActor:async(actor,work)=>{await caller.query('BEGIN');try{await caller.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$3,true)",[actor.organizationId,actor.userId,actor.membershipId]);const result=await work(caller);await caller.query('COMMIT');return result;}catch(e){await caller.query('ROLLBACK');throw e;}}};
   const service=new BookingHoldService(db);let receipt;if(cached)receipt=await service.createHold(f.input);
   const before=await snapshot(f);await locker.query('BEGIN');
   await locker.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$2,true)",[org,f.who]);
   if(lock==='command')await locker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[org+':create_hold:'+f.input.idempotencyKey]);
   if(lock==='reservation')assert.equal((await locker.query('SELECT id FROM reservations WHERE id=$1 FOR UPDATE',[receipt.reservationId])).rowCount,1);
   if(lock==='inventory')await locker.query("INSERT INTO inventory_periods(organization_id,property_id,unit_id,kind,source_ref,stay_period) VALUES($1,$2,$3,'maintenance',$4,tstzrange('2042-05-01T09:00:00Z','2042-05-02T07:00:00Z','[)'))",[org,property,f.unit,randomUUID()]);
   const pid=(await caller.query('SELECT pg_backend_pid() pid')).rows[0].pid,blocker=(await locker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   pending=service.createHold({...f.input,recoveryOnly:cached}).then(value=>({value}),error=>({error}));
   let waiting=false;const deadline=Date.now()+3000;while(Date.now()<deadline){waiting=(await q('SELECT $2=ANY(pg_blocking_pids($1)) waiting',[pid,blocker])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,`hold waits on ${lock}`);
   if(revoke==='session')await q('UPDATE staff_private.sessions SET revoked_at=now() WHERE token_hash=$1',[f.hash]);
   if(revoke==='role')await q("UPDATE organization_memberships SET role_id=(SELECT id FROM roles WHERE code='procurement') WHERE id=$1",[f.who]);
   if(revoke==='membership')await q("UPDATE organization_memberships SET status='suspended' WHERE id=$1",[f.who]);
   if(revoke==='scope')await q('DELETE FROM membership_property_scopes WHERE membership_id=$1',[f.who]);
   await locker.query('ROLLBACK');const result=await pending;
   assert.ok(result.error,`${cached}/${revoke}/${lock} must reject`);assert.ok(['STAFF_SESSION_REQUIRED','PROPERTY_FORBIDDEN','QUOTE_NOT_FOUND'].includes(result.error.message));assert.deepEqual(await snapshot(f),before);
  }finally{await locker.query('ROLLBACK').catch(()=>{});if(pending)await pending;await caller.end();await locker.end();}
 }
 console.log(`Booking hold recovery: ${cases.length} current session/role/membership/property races PASS; no unauthorized command, inventory or reservation changes.`);
};
