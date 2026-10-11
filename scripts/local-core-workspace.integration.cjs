'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../apps/api/package.json'));
const {Client}=req('pg');
const ROOT=path.join(process.env.LOCALAPPDATA||'','VIEWS-Staging'),BASE='http://127.0.0.1:4173';
(async()=>{
 if(process.platform!=='win32'||process.argv[2]!=='--ack=LOCAL_WORKSPACE_TEST')throw Error('LOCAL_TEST_ACK_REQUIRED');
 const secrets=JSON.parse(fs.readFileSync(path.join(ROOT,'private/runtime.json'),'utf8'));
 const fixture=JSON.parse(fs.readFileSync(path.join(ROOT,'private/workspace.json'),'utf8'));
 if(secrets.scope!=='views-windows-local-rehearsal'||fixture.scope!=='views-local-core-workspace')throw Error('LOCAL_SCOPE_MISMATCH');
 const db=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_owner',password:secrets.ownerPassword,connectionTimeoutMillis:5000});
 await db.connect();const checks=[];let cookie='',csrf='',calls=0;const created=[];
 async function raw(route,{body,key,headers={},method,session=true}={}){
   const h={'x-views-local-workspace':'1',...headers};
   if(session){h.cookie=cookie;h['x-csrf-token']=csrf;}
   if(body!==undefined){h['content-type']='application/json';h.origin=BASE;}
   if(key)h['idempotency-key']=key;
   Object.assign(h,headers);
   const r=await fetch(BASE+route,{method:method||(body===undefined?'GET':'POST'),headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
   calls++;return {status:r.status,body:await r.json().catch(()=>null),headers:r.headers};
 }
 async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
 async function current(){const r=await raw('/local-api/workspace');assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
 let report={schemaVersion:1,stage:'7.24',result:'fail',checks,realPayments:false,scope:'windows-local-synthetic-workspace',
   sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,cwd:path.resolve(__dirname,'..')}).stdout.trim(),
   trackedSourceDirty:spawnSync('git',['diff','--quiet','HEAD'],{windowsHide:true,cwd:path.resolve(__dirname,'..')}).status!==0};
 try{
   await check('session_requires_explicit_local_header',async()=>{
     const r=await fetch(BASE+'/local-api/session');assert.equal(r.status,403);
   });
   await check('same_origin_synthetic_session_and_HttpOnly_cookie',async()=>{
     const r=await raw('/local-api/session',{session:false});assert.equal(r.status,200);const set=r.headers.get('set-cookie');
     assert.ok(set.includes('HttpOnly')&&set.includes('SameSite=Strict'));cookie=set.split(';')[0];csrf=r.body.csrf;
     assert.equal(r.body.identity,'synthetic-front-desk');assert.equal(r.body.realPayments,false);
   });
   await check('foreign_origin_and_fetch_site_rejected',async()=>{
     assert.equal((await raw('/local-api/session',{headers:{origin:'https://evil.example'},session:false})).status,403);
     assert.equal((await raw('/local-api/session',{headers:{'sec-fetch-site':'cross-site'},session:false})).status,403);
     const status=await new Promise((resolve,reject)=>{require('node:http').get(BASE+'/local-api/session',{headers:{host:'evil.example','x-views-local-workspace':'1'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(status,403);
   });
   await check('no_general_proxy_or_payment_route',async()=>{
     assert.equal((await raw('/local-api/payments',{body:{}})).status,404);
     assert.equal((await raw('/api/session')).status,503);
     assert.equal((await raw('/local-api/workspace?propertyId='+randomUUID())).status,400);
   });
   await check('actor_override_and_missing_csrf_rejected',async()=>{
     assert.equal((await raw('/local-api/workspace',{headers:{'x-organization-id':randomUUID()}})).status,403);
     assert.equal((await raw('/local-api/workspace',{headers:{'x-csrf-token':'wrong'}})).status,403);
   });
   let workspace;
   await check('workspace_read_from_actual_Core_and_DB',async()=>{
     workspace=await current();assert.equal(workspace.property.id,fixture.propertyId);assert.equal(workspace.units.length,2);
     assert.equal(workspace.syntheticData,true);assert.equal(workspace.realPayments,false);
   });
   const offset=60+Math.floor(Math.random()*60),day=n=>new Date(Date.now()+5*3600000+(offset+n)*86400000).toISOString().slice(0,10);
   const input={unitId:fixture.units[0].unitId,ratePlanId:fixture.units[0].ratePlanId,checkIn:day(0),checkOut:day(2),guests:1};
   await check('payload_scope_and_date_checks_precede_dispatch',async()=>{
     assert.equal((await raw('/local-api/quotes',{body:{...input,unitId:randomUUID()}})).status,403);
     assert.equal((await raw('/local-api/quotes',{body:{...input,organizationId:randomUUID()}})).status,400);
     assert.equal((await raw('/local-api/quotes',{body:{...input,checkIn:'2027-02-30'}})).status,400);
     assert.equal((await raw('/local-api/quotes',{body:{...input,guests:3}})).status,400);
     assert.equal((await raw('/local-api/quotes',{body:input,headers:{origin:'https://evil.example'}})).status,403);
   });
   let quote,competing;
   await check('server_quote_total_and_immutable_DB_snapshot',async()=>{
     let r=await raw('/local-api/quotes',{body:input});assert.equal(r.status,200,JSON.stringify(r.body));quote=r.body;
     assert.equal(quote.totalMinor,'130000000');assert.equal(quote.nights,2);assert.equal(quote.currency,'UZS');
     const q=(await db.query('SELECT total_minor::text FROM booking_quotes WHERE id=$1 AND organization_id=$2',[quote.quoteId,fixture.organizationId])).rows[0];
     assert.equal(q.total_minor,quote.totalMinor);
     r=await raw('/local-api/quotes',{body:input});assert.equal(r.status,200);competing=r.body;
   });
   let reservationId;
   await check('parallel_hold_replay_creates_exactly_one_reservation',async()=>{
     const key=randomUUID(),replies=await Promise.all(Array.from({length:6},()=>raw('/local-api/holds',{body:{quoteId:quote.quoteId},key})));
     replies.forEach(r=>assert.equal(r.status,200,JSON.stringify(r.body)));reservationId=replies[0].body.reservationId;created.push(reservationId);
     assert.ok(replies.every(r=>r.body.reservationId===reservationId));
     const counts=(await db.query('SELECT count(*)::int AS n FROM reservations WHERE organization_id=$1 AND idempotency_key=$2',[fixture.organizationId,key])).rows[0];
     assert.equal(counts.n,1);
   });
   await check('overlapping_competing_hold_is_denied',async()=>{
     const r=await raw('/local-api/holds',{body:{quoteId:competing.quoteId},key:randomUUID()});assert.equal(r.status,409,JSON.stringify(r.body));
     const q=await raw('/local-api/quotes',{body:input});assert.equal(q.status,400);assert.equal(q.body.error,'UNIT_NOT_AVAILABLE');
   });
   await check('other_session_cannot_take_our_quote',async()=>{
     const s=await raw('/local-api/session',{session:false});
     const r=await raw('/local-api/holds',{body:{quoteId:quote.quoteId},key:randomUUID(),headers:{cookie:s.headers.get('set-cookie').split(';')[0],'x-csrf-token':s.body.csrf}});
     assert.equal(r.status,403);assert.equal(r.body.error,'QUOTE_OUTSIDE_SESSION');
   });
   await check('reservation_survives_independent_workspace_fetch',async()=>{
     const data=await current();const r=data.reservations.find(v=>v.reservationId===reservationId);assert.ok(r);assert.equal(r.status,'hold');assert.equal(r.totalMinor,quote.totalMinor);
   });
   await check('release_replay_frees_inventory_without_financial_rows',async()=>{
     const key=randomUUID();for(let i=0;i<2;i++){const r=await raw('/local-api/release',{body:{reservationId},key});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'cancelled');}
     const r=(await db.query(`SELECT r.status,(SELECT count(*)::int FROM inventory_periods i WHERE i.reservation_id=r.id) AS inventory,
       (SELECT count(*)::int FROM payment_intents p WHERE p.reservation_id=r.id) AS payments FROM reservations r WHERE r.id=$1`,[reservationId])).rows[0];
     assert.deepEqual(r,{status:'cancelled',inventory:0,payments:0});
     const newQuote=await raw('/local-api/quotes',{body:input});assert.equal(newQuote.status,200);
   });
   await check('Core_rejects_browser_actor_without_service_auth',async()=>{
     const r=await fetch('http://127.0.0.1:3001/v1/booking-workspace?propertyId='+fixture.propertyId,{headers:{'x-organization-id':fixture.organizationId,'x-user-id':fixture.userId,'x-membership-id':fixture.membershipId}});
     assert.equal(r.status,401);
   });
   await check('Core_property_scope_denies_foreign_object',async()=>{
     const r=await fetch('http://127.0.0.1:3001/v1/booking-workspace?propertyId=73000000-0000-4000-8000-000000000002',{headers:{
       'x-organization-id':fixture.organizationId,'x-user-id':fixture.userId,'x-membership-id':fixture.membershipId,
       'x-views-service-id':'local-workspace','x-views-internal-key':secrets.internalSecret,'x-request-id':randomUUID()}});
     assert.equal(r.status,403);
   });
   report={...report,result:'pass',checkedAt:new Date().toISOString(),checkCount:checks.length,httpCalls:calls,
     reservationId,serverTotalMinor:quote.totalMinor,currency:'UZS',reservationsCreated:1,reservationsReleased:1,
     financialPaymentsCreated:0,coreGuardRetained:true,browserGetsServiceSecret:false,publicDeployment:false};
 }catch(e){report.error=e.message;process.exitCode=1;}
 finally{
   // Only release reservations this test itself created, through existing Core API.
   for(const id of created){try{await raw('/local-api/release',{body:{reservationId:id},key:randomUUID()});}catch{}}
   await db.end();
 }
 fs.writeFileSync(path.join(ROOT,'evidence','stage724-integration.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error('LOCAL_INTEGRATION_SETUP_FAILED:'+String(e.code||'ERROR'));process.exitCode=1;});
