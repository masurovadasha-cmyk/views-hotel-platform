'use strict';
// Real HTTP -> local gateway -> registered Nest guards/controllers -> restricted PostgreSQL.
const assert=require('node:assert/strict'),http=require('node:http');
const {randomUUID,randomBytes,createHash,createHmac}=require('node:crypto');
const {createLocalGateway}=require('../apps/api/ops/local-core-gateway.cjs');
module.exports=async({admin,coreOrigin,internalKey})=>{
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org=randomUUID(),property=randomUUID(),type=randomUUID();
 await admin.query("INSERT INTO organizations(id,type,legal_name,display_name,country_code,default_currency,timezone) VALUES($1,'platform','Synthetic wave2 HTTP','{\"en\":\"Synthetic wave2 HTTP\"}','UZ','UZS','Asia/Tashkent')",[org]);
 await admin.query("INSERT INTO properties(id,organization_id,name,country_code,city,timezone) VALUES($1,$2,'{\"en\":\"Synthetic wave2 HTTP\"}','UZ','Tashkent','Asia/Tashkent')",[property,org]);
 await admin.query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 const savedOrg=process.env.VIEWS_STAFF_AUTH_ORGANIZATION_ID;process.env.VIEWS_STAFF_AUTH_ORGANIZATION_ID=org;
 const saved=process.env.VIEWS_OWNER_SERVICES_ENABLED;process.env.VIEWS_OWNER_SERVICES_ENABLED='true';
 async function actor(role){const id=randomUUID(),token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
  await admin.query("INSERT INTO users(id,email,display_name) VALUES($1,$1::uuid::text||'@views.invalid','Synthetic wave2 HTTP actor')",[id]);
  await admin.query("INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status) SELECT $1,$2,$1,id,'active' FROM roles WHERE code=$3",[id,org,role]);
  await admin.query('INSERT INTO membership_property_scopes VALUES($1,$2)',[id,property]);
  await admin.query("INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) VALUES($1,$2,'local_fixture')",[id,'scrypt-v1$131072$8$1$'+'00'.repeat(16)+'$'+'00'.repeat(64)]);
  await admin.query('INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id) SELECT $1,id,1,role_id FROM organization_memberships WHERE id=$2',[hash,id]);return {id,token,hash};
 }
 async function hold(){const unit=randomUUID(),id=randomUUID();await admin.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[unit,property,type]);
  await admin.query("INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot,hold_expires_at) VALUES($1,$2,$3,$4,$1::uuid::text,'hold','2045-01-01','2045-01-02','UZS','{}',clock_timestamp()+interval '1 hour')",[id,org,property,unit]);
  await admin.query("INSERT INTO inventory_periods(organization_id,property_id,unit_id,kind,reservation_id,stay_period,expires_at) VALUES($1,$2,$3,'payment_hold',$4,tstzrange('2045-01-01','2045-01-02','[)'),clock_timestamp()+interval '1 hour')",[org,property,unit,id]);return id;}
 const catalogueId=randomUUID(),guestId=randomUUID();
 await admin.query("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'PRIVATE','HTTP fixture')",[guestId,org]);
 await admin.query("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind,duration_minutes) VALUES($1,$2,$3,$1::uuid::text,'{\"en\":\"Synthetic HTTP service\"}','UZS',12345,true,'cleaning',40)",[catalogueId,org,property]);
 await admin.query("INSERT INTO service_orders(id,organization_id,property_id,service_id,guest_profile_id,currency,quantity,total_minor,commission_minor,status,requested_for,snapshot,idempotency_key) VALUES($1,$2,$3,$1,$4,'UZS',1,12345,0,'requested',clock_timestamp(),'{\"name\":{\"en\":\"Synthetic HTTP service\"},\"message\":\"PRIVATE\"}',$1::uuid::text)",[catalogueId,org,property,guestId]);
 const owner=await actor('owner'),staff=await actor('front_desk');
 const headers=a=>({'content-type':'application/json','x-views-service-id':'local-workspace','x-views-internal-key':internalKey,'x-request-id':randomUUID(),'x-organization-id':org,'x-user-id':a.id,'x-membership-id':a.id,'x-views-staff-session':a.token});
 async function direct(path,a=owner,body,key){const r=await fetch(coreOrigin+path,{method:body===undefined?'GET':'POST',headers:{...headers(a),...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};}
 const gateway=createLocalGateway({configuration:{fixture:{organizationId:org,propertyId:property,units:[]},internalKey},fetchImpl:(url,init)=>fetch(coreOrigin+new URL(url).pathname+new URL(url).search,init)});
 const server=http.createServer(async(req,res)=>{if(!await gateway(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const endpoint='http://127.0.0.1:'+server.address().port;
 async function local(path,a=owner,body,key,extra={}){return new Promise((resolve,reject)=>{const payload=body===undefined?undefined:JSON.stringify(body),request=http.request(endpoint+'/local-api/'+path,{method:payload===undefined?'GET':'POST',headers:{host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173','content-type':'application/json','x-views-local-workspace':'1',cookie:'views_staff_session='+a.token,'x-csrf-token':createHmac('sha256',internalKey).update('staff-csrf:'+a.token).digest('hex'),...(key?{'idempotency-key':key}:{}),...extra}},response=>{const parts=[];response.on('data',part=>parts.push(part));response.on('end',()=>{try{resolve({status:response.statusCode,body:JSON.parse(Buffer.concat(parts).toString()),cache:response.headers['cache-control']});}catch(e){reject(e);}});});request.on('error',reject);request.end(payload);});}

 try{
  const route='/v1/owner-services/'+property+'?kind=catalog&limit=1';const core=await direct(route);if(core.status!==200)console.error('WAVE2_OWNER_HTTP_REJECTION',core.status,core.body.message);assert.equal(core.status,200,JSON.stringify(core.body));assert.equal(core.cache,'no-store');assert.equal(core.body.readOnly,true);assert.equal(core.body.propertyId,property);assert.equal(core.body.items[0].id,catalogueId);assert.deepEqual(Object.keys(core.body.items[0]).sort(),['id','code','name','executionKind','priceMinor','currency'].sort());
  const bff=await local('owner-services/'+property+'?kind=orders&limit=1');if(bff.status!==200)console.error('WAVE2_GATEWAY_REJECTION',bff.status,bff.body.error);assert.equal(bff.status,200,JSON.stringify(bff.body));assert.equal(bff.body.kind,'orders');assert.equal(bff.body.readOnly,true);assert.equal(bff.body.items[0].id,catalogueId);assert.deepEqual(Object.keys(bff.body.items[0]).sort(),['id','serviceId','name','status','quantity','requestedFor','createdAt'].sort());assert.ok(!JSON.stringify(bff.body).includes('PRIVATE'));
  assert.equal((await direct(route,staff)).status,403);assert.equal((await local('owner-services/'+property+'?kind=orders',staff)).status,403);
  assert.equal((await local('owner-services/'+property+'?kind=orders&kind=catalog')).status,400);assert.equal((await local('owner-services/'+property+'?kind=orders&actor=x')).status,400);
  assert.equal((await direct('/v1/owner-services/10000000-0000-4000-8000-000000000002?kind=orders')).status,401);
  assert.equal((await local('owner-services/'+property+'?kind=orders',owner,undefined,undefined,{'x-user-id':staff.id})).status,403);
  process.env.VIEWS_OWNER_SERVICES_ENABLED='false';assert.equal((await direct(route)).status,404);assert.equal((await local('owner-services/'+property+'?kind=orders')).status,404);process.env.VIEWS_OWNER_SERVICES_ENABLED='true';
  const reservation=await hold(),key=randomUUID();const workspace=await local('workspace',staff);assert.equal(workspace.status,200,JSON.stringify(workspace.body));assert.ok(workspace.body.reservations.some(r=>r.reservationId===reservation));
  const released=await local('release',staff,{reservationId:reservation},key);assert.equal(released.status,200,JSON.stringify(released.body));assert.equal(released.body.releaseOutcome,'released');assert.equal(released.body.status,'cancelled');
  const replay=await local('release',staff,{reservationId:reservation,recoveryOnly:true},key);assert.equal(replay.status,200);assert.equal(replay.body.idempotentReplay,true);assert.equal(replay.body.releaseOutcome,'released');
  const untouched=await hold(),fence=randomUUID();const absent=await local('release',staff,{reservationId:untouched},fence);assert.equal(absent.status,200,JSON.stringify(absent.body));assert.equal(absent.body.releaseOutcome,'not_applied');assert.equal(absent.body.activeHold,true);
  const late=await direct('/v1/bookings/'+untouched+'/release',staff,{},fence);assert.equal(late.status,200);assert.equal(late.body.releaseOutcome,'not_applied');assert.equal(late.body.activeHold,true);
  for(const body of [{reservationId:untouched,recoveryOnly:false},{reservationId:untouched,propertyId:property}])assert.equal((await local('release',staff,body,randomUUID())).status,400);
  assert.equal((await local('release',staff,{reservationId:untouched},randomUUID(),{'x-csrf-token':''})).status,403);
  assert.equal((await local('check-in',staff,{reservationId:untouched},randomUUID())).status,403,'other mutations retain cache boundary');
  await admin.query('UPDATE staff_private.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[staff.hash]);assert.equal((await local('release',staff,{reservationId:reservation,recoveryOnly:true},key)).status,401);
  await admin.query('UPDATE staff_private.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[owner.hash]);assert.equal((await direct(route)).status,401);assert.equal((await local('owner-services/'+property+'?kind=orders')).status,401);
  console.log('Wave2 real HTTP: B2 release/replay/cache-miss fence/late original/CSRF; H2 registered route/session/role/scope/query/default-off; gateway credentials and revocation PASS.');
 }finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});if(savedOrg===undefined)delete process.env.VIEWS_STAFF_AUTH_ORGANIZATION_ID;else process.env.VIEWS_STAFF_AUTH_ORGANIZATION_ID=savedOrg;if(saved===undefined)delete process.env.VIEWS_OWNER_SERVICES_ENABLED;else process.env.VIEWS_OWNER_SERVICES_ENABLED=saved;}
};
