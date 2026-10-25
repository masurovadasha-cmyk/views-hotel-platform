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
 try {
  const s=await staff(),f=await fixture();
  const incumbent=await service.offer(s.actor,s.raw,randomUUID(),f.body);
  const lostKey=randomUUID();
  await assert.rejects(service.offer(s.actor,s.raw,lostKey,f.body),/PARTNER_ALREADY_ASSIGNED/);
  const rejected=await decide(f,incumbent,randomUUID(),{action:'reject',expectedRevision:1,termsVersion:1});
  assert.equal(rejected.status,'rejected');
  const late=await service.offer(s.actor,s.raw,lostKey,f.body);
  console.log(JSON.stringify({finding:'P1_409_NOT_PERMANENT',firstAttempt:'PARTNER_ALREADY_ASSIGNED',interveningAction:'reject incumbent',lateSameKeyStatus:late.status,lateSameKeyReplay:late.idempotentReplay,sourceRevision:(await snapshot(f)).c.revision}));
  assert.notEqual(late.status,'offered','UNSAFE: cleared 409 intent later creates assignment with exact same command');
 } finally {await pool.end();for(const k of ['NODE_ENV','VIEWS_LOCAL_REHEARSAL','VIEWS_PARTNER_PILOT_ENABLED'])if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
};
