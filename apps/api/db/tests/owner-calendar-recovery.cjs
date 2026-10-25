'use strict';
const assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {Client}=require('pg');
const {OwnerCalendarService}=require('../../dist/owner/owner-calendar.service.js');
// Invoked only by the coordinator's disposable runner, never by the public app.
module.exports=async function({admin,runtimeUrl}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='00000000-0000-0000-0000-000000000001',property='00000000-0000-0000-0000-000000000002',type='00000000-0000-0000-0000-000000000003';
 const old={...process.env};process.env.NODE_ENV='test';process.env.VIEWS_LOCAL_REHEARSAL='true';process.env.VIEWS_OWNER_CALENDAR_ENABLED='true';
 async function fixture(role='owner'){
  const who=randomUUID(),unit=randomUUID(),key=randomUUID(),token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
  await admin.query("INSERT INTO users(id,email,display_name) VALUES($1,$1::uuid::text||'@views.invalid','Synthetic calendar recovery')",[who]);
  await admin.query("INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status) SELECT $1,$2,$1,id,'active' FROM roles WHERE code=$3",[who,org,role]);
  await admin.query("INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) VALUES($1,$2,'local_fixture')",[who,'scrypt-v1$131072$8$1$'+'00'.repeat(16)+'$'+'00'.repeat(64)]);
  await admin.query('INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id) SELECT $2,id,1,role_id FROM organization_memberships WHERE id=$1',[who,hash]);
  await admin.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[unit,property,type]);
  return {who,unit,key,token,hash,actor:{organizationId:org,userId:who,membershipId:who,requestId:randomUUID()},body:{action:'block',unitId:unit,kind:'maintenance',start:'2042-05-01T14:00+05:00',end:'2042-05-02T12:00+05:00'}};
 }
 const caller=new Client({connectionString:runtimeUrl}),locker=new Client({connectionString:runtimeUrl});
 try{
  await caller.connect();await locker.connect();assert.deepEqual((await caller.query('SELECT current_user role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],{role:'views_app',rolsuper:false,rolbypassrls:false});
  const db={withActor:async(a,work)=>{await caller.query('BEGIN');try{await caller.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$3,true)",[a.organizationId,a.userId,a.membershipId]);const result=await work(caller);await caller.query('COMMIT');return result;}catch(e){await caller.query('ROLLBACK');throw e;}}},service=new OwnerCalendarService(db);
  const invoke=(f,recoveryOnly=false)=>service.mutate(f.actor,property,{...f.body,...recoveryOnly?{recoveryOnly:true}:{}},f.key,f.token);
  for(const role of ['owner','manager']){const f=await fixture(role),r=await invoke(f);assert.equal(r.currentState,'blocked');assert.equal((await invoke(f,true)).idempotentReplay,true);const list=await service.list(f.actor,property,'2042-05-01','2042-05-03',f.token);assert.deepEqual(list.recoveryScope,{organizationId:org,userId:f.who,membershipId:f.who,propertyId:property});}
  const denied=await fixture('front_desk');await assert.rejects(invoke(denied),/STAFF_SESSION_REQUIRED/);
  const foreign=await fixture();await assert.rejects(service.list(foreign.actor,'10000000-0000-4000-8000-000000000002','2042-05-01','2042-05-03',foreign.token),/STAFF_SESSION_REQUIRED/);
  await assert.rejects(service.list({...foreign.actor,organizationId:'10000000-0000-4000-8000-000000000001'},property,'2042-05-01','2042-05-03',foreign.token),/STAFF_SESSION_REQUIRED/);
  for(const cached of [false,true])for(const revoke of ['session','role','membership','credential','expiry']){
   const f=await fixture();if(cached)await invoke(f);
   const count=async()=>(await admin.query('SELECT count(*)::int n FROM inventory_periods WHERE unit_id=$1',[f.unit])).rows[0].n,before=await count();
   await locker.query('BEGIN');await locker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['owner-calendar-command:'+org+':'+f.who+':'+f.key]);
   const pid=(await locker.query('SELECT pg_backend_pid() pid')).rows[0].pid;let pending;
   try{
    pending=invoke(f,cached).then(value=>({value}),error=>({error}));let waiting=false;
    const deadline=Date.now()+3000;while(Date.now()<deadline){waiting=(await admin.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) waiting',[pid])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.equal(waiting,true,'observed command lock');
    if(revoke==='session')await admin.query('UPDATE staff_private.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[f.hash]);
    if(revoke==='expiry')await admin.query("UPDATE staff_private.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[f.hash]);
    if(revoke==='role')await admin.query("UPDATE organization_memberships SET role_id=(SELECT id FROM roles WHERE code='front_desk') WHERE id=$1",[f.who]);
    if(revoke==='membership')await admin.query("UPDATE organization_memberships SET status='suspended' WHERE id=$1",[f.who]);
    if(revoke==='credential')await admin.query('UPDATE staff_private.credentials SET version=version+1 WHERE membership_id=$1',[f.who]);
    await locker.query('ROLLBACK');assert.equal((await pending).error?.message,'STAFF_SESSION_REQUIRED');assert.equal(await count(),before);
   }finally{await locker.query('ROLLBACK').catch(()=>{});if(pending)await pending;}
  }
  console.log('Owner calendar recovery: owner/manager, scope isolation and ten observed-wait revocation cases PASS.');
 }finally{await caller.end();await locker.end();for(const k of ['NODE_ENV','VIEWS_LOCAL_REHEARSAL','VIEWS_OWNER_CALENDAR_ENABLED'])if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
};
