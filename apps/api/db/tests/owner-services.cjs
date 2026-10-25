'use strict';
const assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {Client}=require('pg');
const {OwnerServicesService}=require('../../dist/owner/owner-services.service.js');
// Invoked only by the coordinator's disposable runner, never by the public app.
module.exports=async function({admin,runtimeUrl}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='00000000-0000-0000-0000-000000000001',property='00000000-0000-0000-0000-000000000002',type='00000000-0000-0000-0000-000000000003';
 const old={...process.env};process.env.NODE_ENV='test';process.env.VIEWS_LOCAL_REHEARSAL='true';process.env.VIEWS_OWNER_SERVICES_ENABLED='true';
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
  const db={withActor:async(a,work)=>{await caller.query('BEGIN');try{await caller.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$3,true)",[a.organizationId,a.userId,a.membershipId]);const result=await work(caller);await caller.query('COMMIT');return result;}catch(e){await caller.query('ROLLBACK');throw e;}}},service=new OwnerServicesService(db);

  const page=(f,kind='catalog',after)=>service.list(f.actor,f.token,property,{kind,limit:'1',...after?{after}:{}});
  const f=await fixture(),ids=[randomUUID(),randomUUID(),randomUUID()].sort(),guest=randomUUID();
  await admin.query("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'PRIVATE','NEVER PROJECT')",[guest,org]);
  for(const [i,id] of ids.entries()){
   await admin.query(`INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind,duration_minutes) VALUES($1,$2,$3,$1::uuid::text,'{"ru":"Услуга","uz":"Xizmat","en":"Service"}','UZS',12345,$4,'cleaning',40)`,[id,org,property,i<2]);
   await admin.query(`INSERT INTO service_orders(id,organization_id,property_id,service_id,guest_profile_id,currency,quantity,total_minor,commission_minor,status,requested_for,snapshot,idempotency_key) VALUES($1,$2,$3,$1,$4,'UZS',1,12345,0,$5,clock_timestamp(),'{"name":{"en":"Service"},"message":"PRIVATE"}',$1::uuid::text)`,[id,org,property,guest,i===2?'completed':'requested']);
  }
  for(const kind of ['catalog','orders']){
   let cursor,seen=[];for(let i=0;i<100;i++){
    const result=await page(f,kind,cursor);assert.equal(result.readOnly,true);assert.equal(result.propertyId,property);
    for(const row of result.items){assert(!seen.includes(row.id));seen.push(row.id);assert.deepEqual(Object.keys(row).sort(),(kind==='catalog'?['id','code','name','executionKind','priceMinor','currency']:['id','serviceId','name','status','quantity','requestedFor','createdAt']).sort());assert(!JSON.stringify(row).includes('PRIVATE'));}
    if(!result.nextCursor)break;assert(!cursor||result.nextCursor>cursor);cursor=result.nextCursor;
   }
   assert(seen.includes(ids[0])&&seen.includes(ids[1]));assert(!seen.includes(ids[2]));
  }
  await page(await fixture('manager'));
  await assert.rejects(page(await fixture('front_desk')),/STAFF_SESSION_REQUIRED/);
  await assert.rejects(service.list(f.actor,f.token,'10000000-0000-4000-8000-000000000002',{kind:'orders'}),/STAFF_SESSION_REQUIRED/);
  await assert.rejects(service.list({...f.actor,organizationId:'10000000-0000-4000-8000-000000000001'},f.token,property,{kind:'orders'}),/STAFF_SESSION_REQUIRED/);
  const other=await fixture();await assert.rejects(service.list(f.actor,other.token,property,{kind:'orders'}),/STAFF_SESSION_REQUIRED/);
  for(const revoke of ['session','role','membership','credential','expiry']){
   const current=await fixture();await page(current);
   if(revoke==='session')await admin.query('UPDATE staff_private.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[current.hash]);
   if(revoke==='expiry')await admin.query("UPDATE staff_private.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[current.hash]);
   if(revoke==='role')await admin.query("UPDATE organization_memberships SET role_id=(SELECT id FROM roles WHERE code='front_desk') WHERE id=$1",[current.who]);
   if(revoke==='membership')await admin.query("UPDATE organization_memberships SET status='suspended' WHERE id=$1",[current.who]);
   if(revoke==='credential')await admin.query('UPDATE staff_private.credentials SET version=version+1 WHERE membership_id=$1',[current.who]);
   await assert.rejects(page(current),/STAFF_SESSION_REQUIRED/);
  }
  // Revoke while the catalog read waits, after the API's first authorization.
  const racing=await fixture();await admin.query('BEGIN');await admin.query('LOCK TABLE service_catalog IN ACCESS EXCLUSIVE MODE');
  const pending=page(racing).then(value=>({value}),error=>({error}));
  try{
   const pid=(await admin.query('SELECT pg_backend_pid() pid')).rows[0].pid;let waiting=false;
   for(let i=0;i<100;i++){waiting=(await admin.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) waiting',[pid])).rows[0].waiting;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));}
   assert.equal(waiting,true,'observed projection read wait');
   await admin.query('UPDATE staff_private.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[racing.hash]);await admin.query('COMMIT');
   assert.equal((await pending).error?.message,'STAFF_SESSION_REQUIRED');
  }finally{await admin.query('ROLLBACK');await pending;}
  assert.equal((await admin.query("SELECT has_function_privilege('public','app.owner_services_page(text,uuid,text,uuid,integer)','execute') allowed")).rows[0].allowed,false);
  console.log('Owner services: actual SQL owner/manager scope, strict projection, keyset paging, five current revocation cases and observed-read-wait revocation PASS.');
 }finally{await caller.end();await locker.end();for(const k of ['NODE_ENV','VIEWS_LOCAL_REHEARSAL','VIEWS_OWNER_SERVICES_ENABLED'])if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
};
