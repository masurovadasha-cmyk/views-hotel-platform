'use strict';
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto'),{Client}=require('pg');
const {SlaPolicyService}=require('../../dist/sla-policy/sla-policy.service.js');
module.exports=async function({admin,runtimeUrl}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='00000000-0000-0000-0000-000000000001',oldFlag=process.env.VIEWS_SLA_POLICY_DRAFT_ENABLED,oldLocal=process.env.VIEWS_LOCAL_REHEARSAL,oldNode=process.env.NODE_ENV;
 process.env.NODE_ENV='test';process.env.VIEWS_LOCAL_REHEARSAL='true';process.env.VIEWS_SLA_POLICY_DRAFT_ENABLED='true';
 const clients=[];async function client(){const c=new Client({connectionString:runtimeUrl});await c.connect();clients.push(c);assert.deepEqual((await c.query('SELECT current_user role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],{role:'views_app',rolsuper:false,rolbypassrls:false});return c;}
 function service(c){return new SlaPolicyService({withActor:async(a,work)=>{await c.query('BEGIN');try{await c.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$3,true)",[a.organizationId,a.userId,a.membershipId]);const r=await work(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}});}
 const config={serviceKind:'concierge',milestone:'response',timezone:'Asia/Tashkent',targetMinutes:90,windows:[1,2,3,4,5].map(day=>({day,startMinute:540,endMinute:1020}))};
 async function fixture(role='front_desk'){
  const id=randomUUID(),propertyId=randomUUID(),token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
  await admin.query("INSERT INTO users(id,email,display_name) VALUES($1,$1::uuid::text||'@views.invalid','Synthetic SLA')",[id]);
  await admin.query("INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status) SELECT $1,$2,$1,id,'active' FROM roles WHERE code=$3",[id,org,role]);
  await admin.query("INSERT INTO properties(id,organization_id,name,country_code,city,timezone) VALUES($1,$2,'{\"en\":\"Synthetic SLA\"}','UZ','Tashkent','Asia/Tashkent')",[propertyId,org]);
  await admin.query('INSERT INTO membership_property_scopes(membership_id,property_id) VALUES($1,$2)',[id,propertyId]);
  await admin.query("INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) VALUES($1,$2,'local_fixture')",[id,'scrypt-v1$131072$8$1$'+'00'.repeat(16)+'$'+'00'.repeat(64)]);
  await admin.query('INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id) SELECT $2,id,1,role_id FROM organization_memberships WHERE id=$1',[id,hash]);
  return {id,propertyId,token,hash,actor:{organizationId:org,userId:id,membershipId:id,requestId:randomUUID()},body:{propertyId,expectedRevision:0,policy:config}};
 }
 const operational=async()=>(await admin.query("SELECT md5(coalesce(string_agg(order_id::text||':'||response_due_at::text||':'||coalesce(answered_at::text,''),',' ORDER BY order_id),'')) digest FROM concierge_requests")).rows[0].digest;
 try{
  const caller=await client(),peer=await client(),locker=await client(),s=service(caller),s2=service(peer);
  const operationalGuest=randomUUID(),operationalService=randomUUID(),operationalOrder=randomUUID(),operationalProperty='00000000-0000-0000-0000-000000000002';
  await admin.query("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'Synthetic','SLA')",[operationalGuest,org]);
  await admin.query("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,execution_kind) VALUES($1,$2,$3,$1::uuid::text,'{}','UZS',0,'concierge')",[operationalService,org,operationalProperty]);
  await admin.query("INSERT INTO service_orders(id,organization_id,property_id,service_id,guest_profile_id,currency,quantity,total_minor,commission_minor,requested_for,snapshot,idempotency_key) VALUES($1,$2,$3,$4,$5,'UZS',1,0,0,clock_timestamp(),'{}',$1::uuid::text)",[operationalOrder,org,operationalProperty,operationalService,operationalGuest]);
  await admin.query("INSERT INTO concierge_requests(order_id,organization_id,property_id,category,party_size,budget_minor,response_due_at) VALUES($1,$2,$3,'help',1,0,'2040-01-01T00:15:00Z')",[operationalOrder,org,operationalProperty]);
  const beforeOperational=await operational();
  const f=await fixture(),key=randomUUID(),first=await s.save(f.actor,f.token,key,f.body);assert.equal(first.outcome,'saved');assert.equal(first.appliedRevision,1);
  assert.deepEqual((await s.list(f.actor,f.propertyId,f.token)).recoveryScope,{organizationId:org,userId:f.id,membershipId:f.id,propertyId:f.propertyId});
  const second=await s.save(f.actor,f.token,randomUUID(),{...f.body,expectedRevision:1,policy:{...config,targetMinutes:120}});assert.equal(second.current.revision,2);
  const replay=await s.save(f.actor,f.token,key,{...f.body,recoveryOnly:true});assert.equal(replay.commandKey,key);assert.equal(replay.appliedRevision,1);assert.equal(replay.current.revision,2);assert.equal(replay.idempotentReplay,true);
  const preview=await s.preview(f.actor,f.token,{propertyId:f.propertyId,serviceKind:'concierge',milestone:'response',revision:1,startLocal:'2026-10-23T16:30'});assert.equal(preview.dueLocal,'2026-10-26T10:00');assert.deepEqual(preview.segments.map(x=>x.minutes),[30,60]);assert.equal(preview.approved,false);
  await assert.rejects(s.save(f.actor,f.token,key,{...f.body,policy:{...config,targetMinutes:91}}),/IDEMPOTENCY_CONFLICT/);
  const absent=await fixture(),absentKey=randomUUID();assert.equal((await s.save(absent.actor,absent.token,absentKey,{...absent.body,recoveryOnly:true})).outcome,'not_applied');assert.equal((await s.save(absent.actor,absent.token,absentKey,absent.body)).outcome,'not_applied');assert.equal((await s.list(absent.actor,absent.propertyId,absent.token)).policies.length,0);
  const race=await fixture(),results=await Promise.allSettled([s.save(race.actor,race.token,randomUUID(),race.body),s2.save(race.actor,race.token,randomUUID(),race.body)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.match(results.find(x=>x.status==='rejected').reason.message,/SLA_REVISION_CONFLICT/);
  const denied=await fixture('housekeeper');await assert.rejects(s.list(denied.actor,denied.propertyId,denied.token),/SLA_POLICY_FORBIDDEN/);await assert.rejects(s.list(f.actor,absent.propertyId,f.token),/SLA_POLICY_FORBIDDEN/);await assert.rejects(s.list({...f.actor,organizationId:'10000000-0000-4000-8000-000000000001'},f.propertyId,f.token),/SLA_POLICY_FORBIDDEN/);
  for(const cached of [false,true])for(const lock of ['command','policy'])for(const revoke of ['session','scope','role','expiry']){
   const x=await fixture(),k=randomUUID();if(cached)await s.save(x.actor,x.token,k,x.body);
   const count=async()=>(await admin.query('SELECT count(*)::int n FROM sla_policy_draft_versions WHERE property_id=$1',[x.propertyId])).rows[0].n,n=await count();
   await locker.query('BEGIN');await locker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lock==='command'?org+':sla-command:'+k:org+':sla-policy:'+x.propertyId+':concierge:response']);
   const blocker=(await locker.query('SELECT pg_backend_pid() pid')).rows[0].pid;let pending;
   try{pending=s.save(x.actor,x.token,k,{...x.body,recoveryOnly:cached?true:undefined}).then(value=>({value}),error=>({error}));let waiting=false;const deadline=Date.now()+3000;while(Date.now()<deadline){waiting=(await admin.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) waiting',[blocker])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.equal(waiting,true,'observed SLA '+lock+' wait');
    if(revoke==='session')await admin.query('UPDATE staff_private.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[x.hash]);
    if(revoke==='scope')await admin.query('DELETE FROM membership_property_scopes WHERE membership_id=$1',[x.id]);
    if(revoke==='role')await admin.query("UPDATE organization_memberships SET role_id=(SELECT id FROM roles WHERE code='housekeeper') WHERE id=$1",[x.id]);
    if(revoke==='expiry')await admin.query("UPDATE staff_private.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[x.hash]);
    await locker.query('ROLLBACK');assert.match((await pending).error?.message||'',/SLA_POLICY_FORBIDDEN/);assert.equal(await count(),n);
   }finally{await locker.query('ROLLBACK').catch(()=>{});if(pending)await pending;}
  }
  assert.equal(await operational(),beforeOperational);process.env.VIEWS_SLA_POLICY_DRAFT_ENABLED='';await assert.rejects(s.list(f.actor,f.propertyId,f.token),/SLA_POLICY_DISABLED/);
  console.log('SLA drafts: version/CAS/current replay, absence fence, calendar proof, denied scope,16 observed-wait revocations, unchanged operational deadlines and default-off PASS.');
 }finally{for(const c of clients)await c.end();for(const [key,value] of [['VIEWS_SLA_POLICY_DRAFT_ENABLED',oldFlag],['VIEWS_LOCAL_REHEARSAL',oldLocal],['NODE_ENV',oldNode]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
};
