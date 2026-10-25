'use strict';
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto'),{Pool}=require('pg');
const {PartnerService}=require('../../dist/partner/partner.service.js');
module.exports=async function({admin,runtimeUrl}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const old={...process.env};Object.assign(process.env,{NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_PARTNER_PILOT_ENABLED:'true'});
 const pool=new Pool({connectionString:runtimeUrl,max:8}),org='00000000-0000-0000-0000-000000000001',property='00000000-0000-0000-0000-000000000002';
 const sha=s=>createHash('sha256').update(s).digest('hex'),token=()=>randomBytes(32).toString('hex');
 const db={withActor:async(a,fn)=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$3,true)",[a.organizationId,a.userId||'',a.membershipId||'']);const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},withOrganization:(organizationId,fn)=>db.withActor({organizationId},fn)};
 const service=new PartnerService(db);
 async function staff(role='manager'){
  const who=randomUUID(),raw=token();await admin.query("INSERT INTO users(id,email) VALUES($1,$1::uuid::text||'@views.invalid')",[who]);
  await admin.query("INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status) SELECT $1,$2,$1,id,'active' FROM roles WHERE code=$3",[who,org,role]);
  await admin.query("INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) VALUES($1,$2,'local_fixture')",[who,'scrypt-v1$131072$8$1$'+'00'.repeat(16)+'$'+'00'.repeat(64)]);
  await admin.query('INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id) SELECT $2,id,1,role_id FROM organization_memberships WHERE id=$1',[who,sha(raw)]);
  return {raw,who,actor:{organizationId:org,userId:who,membershipId:who,requestId:randomUUID()}};
 }
 async function fixture(){
  const order=randomUUID(),catalog=randomUUID(),guest=randomUUID(),provider=randomUUID(),principal=randomUUID(),grant=randomUUID(),raw=token();
  await admin.query("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'PRIVATE','NOT FOR PARTNER')",[guest,org]);
  await admin.query(`INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind) VALUES($1,$2,$3,$1::uuid::text,'{"en":"Private named service"}','UZS',0,true,'concierge')`,[catalog,org,property]);
  await admin.query(`INSERT INTO service_orders(id,organization_id,property_id,service_id,guest_profile_id,currency,quantity,total_minor,commission_minor,requested_for,snapshot,idempotency_key) VALUES($1,$2,$3,$4,$5,'UZS',1,0,0,clock_timestamp()+interval '1 day','{"private":"NEVER"}',$1::uuid::text)`,[order,org,property,catalog,guest]);
  await admin.query("INSERT INTO concierge_requests(order_id,organization_id,property_id,category,party_size,budget_minor,response_due_at) VALUES($1,$2,$3,'help',1,0,clock_timestamp()+interval '1 hour')",[order,org,property]);
  await admin.query("INSERT INTO partner_private.providers(id,organization_id,label,active) VALUES($1,$2,'Synthetic provider',true)",[provider,org]);
  await admin.query('INSERT INTO partner_private.principals(id,provider_id,active) VALUES($1,$2,true)',[principal,provider]);
  await admin.query("INSERT INTO partner_private.grants(id,organization_id,property_id,provider_id,service_id,currency,active) VALUES($1,$2,$3,$4,$5,'UZS',true)",[grant,org,property,provider,catalog]);
  await admin.query("INSERT INTO partner_private.sessions(token_hash,provider_id,principal_id,grant_id,grant_version,expires_at) VALUES($1,$2,$3,$4,1,clock_timestamp()+interval '30 minutes')",[sha(raw),provider,principal,grant]);
  return {order,catalog,provider,principal,grant,raw,body:{orderId:order,grantId:grant,expectedOrderRevision:1,expiresAt:new Date(Date.now()+600000).toISOString()}};
 }
 const decide=(f,a,key=randomUUID(),body={action:'accept',expectedRevision:1,termsVersion:1})=>service.decide(f.raw,a.assignmentId,key,body);
 const snapshot=async f=>(await admin.query('SELECT row_to_json(o) o,row_to_json(c) c,(SELECT count(*)::int FROM folio_entries) folios,(SELECT count(*)::int FROM supply_movements) stock FROM service_orders o JOIN concierge_requests c ON c.order_id=o.id WHERE o.id=$1',[f.order])).rows[0];
 let app;
 try{
  assert.deepEqual((await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],{rolsuper:false,rolbypassrls:false});
  const s=await staff(),f=await fixture(),before=await snapshot(f),key=randomUUID(),a=await service.offer(s.actor,s.raw,key,f.body);
  assert.equal(a.status,'offered');assert.deepEqual(Object.keys(a).sort(),['assignmentId','kind','status','revision','termsVersion','requestedFor','expiresAt','synthetic','idempotentReplay'].sort());
  assert.equal((await service.offer(s.actor,s.raw,key,f.body)).idempotentReplay,true);
  await assert.rejects(service.offer(s.actor,s.raw,key,{...f.body,expectedOrderRevision:2}),/PARTNER_IDEMPOTENCY_CONFLICT/);
  const acceptedKey=randomUUID(),accepted=await decide(f,a,acceptedKey);assert.equal(accepted.status,'accepted');assert.equal(accepted.revision,2);
  assert.deepEqual(await decide(f,a,acceptedKey),{...accepted,idempotentReplay:true});assert.equal((await service.offer(s.actor,s.raw,key,f.body)).status,'accepted');
  await assert.rejects(decide(f,a,acceptedKey,{action:'reject',expectedRevision:1,termsVersion:1}),/PARTNER_IDEMPOTENCY_CONFLICT/);
  assert.deepEqual(await snapshot(f),before);
  const page=await service.list(f.raw,{});assert.equal(page.items.length,1);assert.equal(page.items[0].assignmentId,a.assignmentId);assert(!JSON.stringify(page).includes('PRIVATE'));assert(!JSON.stringify(page).includes(f.order));
  const foreign=await fixture();await assert.rejects(service.decide(foreign.raw,a.assignmentId,randomUUID(),{action:'accept',expectedRevision:1,termsVersion:1}),/PARTNER_NOT_FOUND/);
  await assert.rejects(service.list(s.raw,{}),/PARTNER_SESSION_REQUIRED/);
  const denied=await staff('housekeeper');await assert.rejects(service.dispatch(denied.actor,denied.raw,{propertyId:property}),/PARTNER_NOT_FOUND/);
  await assert.rejects(service.dispatch({...s.actor,organizationId:'10000000-0000-4000-8000-000000000001'},s.raw,{propertyId:property}),/PARTNER_SESSION_REQUIRED/);
  await assert.rejects(service.dispatch(s.actor,s.raw,{propertyId:'10000000-0000-4000-8000-000000000002'}),/PARTNER_NOT_FOUND/);
  const cancelled=await fixture(),cancelOffer=await service.offer(s.actor,s.raw,randomUUID(),cancelled.body);await admin.query("UPDATE concierge_requests SET stage='cancelled',revision=revision+1 WHERE order_id=$1",[cancelled.order]);await assert.rejects(decide(cancelled,cancelOffer),/PARTNER_TRANSITION_INVALID/);
  const race=await fixture(),raceOffer=await service.offer(s.actor,s.raw,randomUUID(),race.body),raceResults=await Promise.allSettled([decide(race,raceOffer),decide(race,raceOffer,randomUUID(),{action:'reject',expectedRevision:1,termsVersion:1})]);assert.equal(raceResults.filter(r=>r.status==='fulfilled').length,1);
  // Observe the source-row wait, revoke a different authority each time, then release.
  for(const mutation of ['session','expiry','grant','version','principal','provider','source']){
   const x=await fixture(),offer=await service.offer(s.actor,s.raw,randomUUID(),x.body),unchanged=await snapshot(x);
   await admin.query('BEGIN');await admin.query('SELECT order_id FROM concierge_requests WHERE order_id=$1 FOR UPDATE',[x.order]);
   const pending=decide(x,offer).then(value=>({value}),error=>({error}));
   try{
    const pid=(await admin.query('SELECT pg_backend_pid() pid')).rows[0].pid;let waiting=false;for(let i=0;i<150;i++){waiting=(await admin.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) waiting',[pid])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert(waiting,'observed source row lock');
    if(mutation==='session')await admin.query('UPDATE partner_private.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[sha(x.raw)]);
    if(mutation==='expiry')await admin.query("UPDATE partner_private.sessions SET created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE token_hash=$1",[sha(x.raw)]);
    if(mutation==='grant')await admin.query('UPDATE partner_private.grants SET active=false WHERE id=$1',[x.grant]);
    if(mutation==='version')await admin.query('UPDATE partner_private.grants SET version=version+1 WHERE id=$1',[x.grant]);
    if(mutation==='principal')await admin.query('UPDATE partner_private.principals SET active=false WHERE id=$1',[x.principal]);
    if(mutation==='provider')await admin.query('UPDATE partner_private.providers SET active=false WHERE id=$1',[x.provider]);
    if(mutation==='source')await admin.query('UPDATE concierge_requests SET revision=revision+1 WHERE order_id=$1',[x.order]);
    await admin.query('COMMIT');assert.equal((await pending).error?.message,mutation==='source'?'PARTNER_REVISION_CHANGED':'PARTNER_SESSION_REQUIRED');
    assert.equal((await admin.query('SELECT status FROM partner_private.assignments WHERE id=$1',[offer.assignmentId])).rows[0].status,'offered');if(mutation!=='source')assert.deepEqual(await snapshot(x),unchanged);
   }finally{await admin.query('ROLLBACK');await pending;}
  }
  const duplicate=await fixture(),duplicateKey=randomUUID(),copies=await Promise.all(Array.from({length:3},()=>service.offer(s.actor,s.raw,duplicateKey,duplicate.body)));assert.equal(copies.filter(r=>!r.idempotentReplay).length,1);
  const expired=await fixture(),expiredOffer=await service.offer(s.actor,s.raw,randomUUID(),expired.body);await admin.query("UPDATE partner_private.assignments SET created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1",[expiredOffer.assignmentId]);await assert.rejects(decide(expired,expiredOffer),/PARTNER_EXPIRED/);assert.equal((await service.list(expired.raw,{})).items[0].status,'expired');
  const rollback=await fixture(),rollbackOffer=await service.offer(s.actor,s.raw,randomUUID(),rollback.body),rollbackKey=randomUUID();
  await admin.query("CREATE FUNCTION pg_temp.partner_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_OUTBOX_FAILURE';END $$");
  await admin.query(`CREATE TRIGGER partner_proof_failure BEFORE INSERT ON outbox_events FOR EACH ROW WHEN (NEW.aggregate_id='${rollbackOffer.assignmentId}'::uuid AND NEW.event_type='partner.assignment.accepted') EXECUTE FUNCTION pg_temp.partner_fail()`);
  try{await assert.rejects(decide(rollback,rollbackOffer,rollbackKey),/SYNTHETIC_OUTBOX_FAILURE/);}finally{await admin.query('DROP TRIGGER partner_proof_failure ON outbox_events');}
  assert.equal((await admin.query('SELECT status FROM partner_private.assignments WHERE id=$1',[rollbackOffer.assignmentId])).rows[0].status,'offered');assert.equal((await admin.query('SELECT count(*)::int n FROM partner_private.commands WHERE command_key=$1',[rollbackKey])).rows[0].n,0);assert.equal((await decide(rollback,rollbackOffer,rollbackKey)).status,'accepted');
  // Stable bounded UUID paging; history fixtures are synthetic rejected offers.
  for(let i=0;i<23;i++)await admin.query("INSERT INTO partner_private.assignments(organization_id,property_id,order_id,grant_id,grant_version,source_revision,status,requested_for,expires_at) VALUES($1,$2,$3,$4,1,1,'rejected',clock_timestamp()+interval '1 day',clock_timestamp()+interval '10 minutes')",[org,property,duplicate.order,duplicate.grant]);
  const first=await service.list(duplicate.raw,{}),second=await service.list(duplicate.raw,{after:first.nextCursor});assert.equal(first.items.length,20);assert.equal(second.items.length,4);assert.equal(second.nextCursor,null);assert(second.items.every(row=>row.assignmentId>first.nextCursor&&!first.items.some(old=>old.assignmentId===row.assignmentId)));
  // Staff authority is also revalidated after a source wait.
  const revokedStaff=await staff(),offered=await fixture();await admin.query('BEGIN');await admin.query('SELECT order_id FROM concierge_requests WHERE order_id=$1 FOR UPDATE',[offered.order]);
  const pendingStaff=service.offer(revokedStaff.actor,revokedStaff.raw,randomUUID(),offered.body).then(value=>({value}),error=>({error}));
  try{const pid=(await admin.query('SELECT pg_backend_pid() pid')).rows[0].pid;let waiting=false;for(let i=0;i<150;i++){waiting=(await admin.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) waiting',[pid])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert(waiting);await admin.query('UPDATE staff_private.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[sha(revokedStaff.raw)]);await admin.query('COMMIT');assert.equal((await pendingStaff).error?.message,'PARTNER_SESSION_REQUIRED');assert.equal((await admin.query('SELECT count(*)::int n FROM partner_private.assignments WHERE order_id=$1',[offered.order])).rows[0].n,0);}finally{await admin.query('ROLLBACK');await pendingStaff;}
  // Cached partner results remain subject to current authorization.
  await admin.query('UPDATE partner_private.grants SET active=false WHERE id=$1',[f.grant]);await assert.rejects(decide(f,a,acceptedKey),/PARTNER_SESSION_REQUIRED/);
  // Register real Nest controllers on loopback: input/header isolation is HTTP-tested.
  const {NestFactory}=require('@nestjs/core'),{Module}=require('@nestjs/common'),{PartnerDispatchController,PartnerAssignmentsController}=require('../../dist/partner/partner.controller.js');
  class TestModule{};Module({controllers:[PartnerDispatchController,PartnerAssignmentsController],providers:[{provide:PartnerService,useValue:service}]})(TestModule);
  app=await NestFactory.create(TestModule,{logger:false});await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  let response=await fetch(base+'/v1/partner-assignments',{headers:{'x-views-partner-session':foreign.raw}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  response=await fetch(base+'/v1/partner-assignments',{headers:{'x-views-partner-session':foreign.raw,'x-user-id':s.who}});assert.equal(response.status,401);
  response=await fetch(base+'/v1/partner-assignments?after=bad',{headers:{'x-views-partner-session':foreign.raw}});assert.equal(response.status,400);
  response=await fetch(base+'/v1/partner-assignments/'+a.assignmentId+'/decisions',{method:'POST',headers:{'content-type':'application/json','x-views-partner-session':foreign.raw,'idempotency-key':randomUUID()},body:JSON.stringify({action:'pay',expectedRevision:1,termsVersion:1})});assert.equal(response.status,400);
  response=await fetch(base+'/v1/partner-dispatch?propertyId='+property,{headers:{'x-views-staff-session':s.raw,'x-organization-id':org,'x-user-id':s.who,'x-membership-id':s.who}});assert.equal(response.status,200);
  const httpFixture=await fixture(),httpKey=randomUUID();
  const staffHeaders={'content-type':'application/json','x-views-staff-session':s.raw,'x-organization-id':org,'x-user-id':s.who,'x-membership-id':s.who,'idempotency-key':httpKey};
  response=await fetch(base+'/v1/partner-dispatch/offers',{method:'POST',headers:staffHeaders,body:JSON.stringify(httpFixture.body)});assert.equal(response.status,200);const httpOffer=await response.json();assert.equal(httpOffer.status,'offered');
  const decisionKey=randomUUID(),decisionBody=JSON.stringify({action:'reject',expectedRevision:1,termsVersion:1}),partnerHeaders={'content-type':'application/json','x-views-partner-session':httpFixture.raw,'idempotency-key':decisionKey};
  response=await fetch(base+'/v1/partner-assignments/'+httpOffer.assignmentId+'/decisions',{method:'POST',headers:partnerHeaders,body:decisionBody});assert.equal(response.status,200);assert.equal((await response.json()).status,'rejected');
  response=await fetch(base+'/v1/partner-assignments/'+httpOffer.assignmentId+'/decisions',{method:'POST',headers:partnerHeaders,body:decisionBody});assert.equal(response.status,200);assert.equal((await response.json()).idempotentReplay,true);
  await admin.query('UPDATE partner_private.grants SET active=false WHERE id=$1',[httpFixture.grant]);await admin.query('UPDATE partner_private.grants SET active=true WHERE id=$1',[httpFixture.grant]);await assert.rejects(service.list(httpFixture.raw,{}),/PARTNER_SESSION_REQUIRED/);
  const noPublic=(await admin.query("SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE (n.nspname='partner_private' OR n.nspname='app' AND p.proname LIKE 'partner_%') AND a.grantee=0 AND a.privilege_type='EXECUTE'")).rows[0].n;assert.equal(noPublic,0);
  await assert.rejects(pool.query('SELECT * FROM partner_private.sessions'),/permission denied/);
  console.log('Partner foundation: real SQL scope/PII projection, idempotency, competing decisions, eight observed-wait revocations, bounded pagination, atomic rollback, unchanged source/stock/folio and loopback Nest HTTP input isolation PASS.');
 }finally{if(app)await app.close();await pool.end();for(const k of ['NODE_ENV','VIEWS_LOCAL_REHEARSAL','VIEWS_PARTNER_PILOT_ENABLED'])if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
};
