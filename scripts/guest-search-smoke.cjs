'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async({db,coreOrigin,session,fixture})=>{
 assert.equal((await db.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 await db.withOrganization(fixture.organizationId,async c=>{
  const policy=randomUUID();await c.query("INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules) VALUES($1::uuid,$2,$3,'{}','{}')",[policy,fixture.organizationId,policy]);
  await c.query('UPDATE rate_plans SET cancellation_policy_id=$1 WHERE id=$2',[policy,fixture.ratePlanId]);
 });
 const url=coreOrigin+'/v1/guest-identity/sms/search?from=2037-10-01&to=2037-10-02&guests=2&city=';
 const headers={Authorization:'Bearer '+session.token};
 assert.equal((await fetch(url)).status,401);
 assert.equal((await fetch(url+'&actor=forged',{headers})).status,400);
 let response=await fetch(url,{headers});assert.equal(response.status,200);let result=await response.json();
 assert.equal(result.requiresQuote,true);assert.equal(result.priceKind,'base_nightly_excludes_charges');
 assert.ok(result.items.some(x=>x.unitId===fixture.unitId));
 assert.ok(result.items.every(x=>x.propertyId==='10000000-0000-4000-8000-000000000002'));
 assert.ok(!JSON.stringify(result).includes('organizationId'));
 response=await fetch(url.replace('guests=2','guests=20'),{headers});result=await response.json();assert.ok(!result.items.some(x=>x.unitId===fixture.unitId));
 await db.withOrganization(fixture.organizationId,c=>c.query("INSERT INTO inventory_periods(unit_id,organization_id,property_id,kind,stay_period) VALUES($1,$2,'10000000-0000-4000-8000-000000000002','maintenance',tstzrange('2037-10-01','2037-10-03','[)'))",[fixture.unitId,fixture.organizationId]));
 try{result=await (await fetch(url,{headers})).json();assert.ok(!result.items.some(x=>x.unitId===fixture.unitId));}
 finally{await db.withOrganization(fixture.organizationId,c=>c.query("DELETE FROM inventory_periods WHERE unit_id=$1 AND kind='maintenance'",[fixture.unitId]));}
 console.log(JSON.stringify({guestSearchSmoke:true,publicationOptIn:true,capacity:true,blockedDates:true,noActor:true}));
};
