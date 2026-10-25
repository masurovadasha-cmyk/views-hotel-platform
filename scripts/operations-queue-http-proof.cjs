'use strict';
// Real registered Nest route, its service-session guard and restricted PostgreSQL.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async({admin,coreOrigin,internalKey})=>{
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',actor='76800000-0000-4000-8000-000000000001';
 const headers={'x-views-service-id':'local-workspace','x-views-internal-key':internalKey,'x-request-id':randomUUID(),'x-organization-id':org,'x-user-id':actor,'x-membership-id':actor,'x-views-staff-session':'a1'.repeat(32)};
 async function get(query='?propertyId='+property,extra={}){const r=await fetch(coreOrigin+'/v1/service-orders/queue'+query,{headers:{...headers,...extra},signal:AbortSignal.timeout(10000)});return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()};}
 const all=await get();assert.equal(all.status,200,JSON.stringify(all.body));assert.equal(all.cache,'no-store');
 assert.deepEqual(all.body.sections.map(s=>s.kind),['cleaning','laundry','market','concierge']);
 for(const section of all.body.sections){assert.equal(section.status,section.kind==='market'?'forbidden':'available');for(const row of section.items)assert.deepEqual(Object.keys(row).sort(),['id','kind','revision','sla','stage','unitCode']);}
 const marketActor='76900000-0000-4000-8000-000000000001';
 const one=await get('?propertyId='+property+'&kind=market',{'x-user-id':marketActor,'x-membership-id':marketActor,'x-views-staff-session':'b1'.repeat(32)});assert.equal(one.status,200);assert.deepEqual(one.body.sections.map(s=>s.kind),['market']);assert.equal(one.body.sections[0].status,'available');
 for(const row of one.body.sections[0].items)assert.deepEqual(Object.keys(row).sort(),['id','kind','revision','sla','stage','unitCode']);
 assert.equal((await get('?propertyId='+property+'&kind=bad')).status,400);
 assert.equal((await get(undefined,{'x-views-staff-session':''})).status,401);
 assert.equal((await get(undefined,{'x-user-id':randomUUID()})).status,401);
 const foreign=await get('?propertyId='+randomUUID());assert.equal(foreign.status,200);assert.ok(foreign.body.sections.every(s=>s.status==='forbidden'&&s.items.length===0&&s.nextCursor===null));
 const before=process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED;try{process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED='false';assert.equal((await get()).status,404);}finally{process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED=before;}
 console.log('Operations queue HTTP: registered route, current session/actor, property scope, minimal projection and default-off PASS; no write commands.');
};
