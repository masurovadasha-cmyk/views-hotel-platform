'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function({admin,rpc,session,coreOrigin,internalKey}){
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',id=n=>'76800000-0000-4000-8000-'+String(n).padStart(12,'0');
 const profile=randomUUID(),reservation=randomUUID(),service=randomUUID(),unit=randomUUID(),unitType=randomUUID();
 await admin.query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[unitType,property]);
 await admin.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[unit,property,unitType]);
 await admin.query("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Laundry HTTP')",[profile,session.userId,org]);
 await admin.query("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$5,$4,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '5 days','UZS',0,'{}')",[reservation,org,property,profile,unit]);
 await admin.query("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind) VALUES($1,$2,$3,$1::uuid::text,'{\"en\":\"Synthetic laundry\"}','UZS',100,true,'laundry')",[service,org,property]);
 async function guest(route,body,key=randomUUID()){return rpc('services/laundry'+route,body,session.token,{'Idempotency-Key':key});}
 async function staff(route,body,n=1){
  const response=await fetch(coreOrigin+'/v1/service-orders/laundry'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-views-service-id':'local-workspace','x-views-internal-key':internalKey,'x-request-id':randomUUID(),'x-organization-id':org,'x-user-id':id(n),'x-membership-id':id(n),'x-views-staff-session':('a'+n).repeat(32),'Idempotency-Key':randomUUID()},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  return {status:response.status,body:await response.json()};
 }
 const body={reservationId:reservation,serviceId:service,declaredCount:2,expectedRevision:1,preferences:'No perfume',pickupAt:new Date(Date.now()+3600000).toISOString()};
 assert.equal((await rpc('services/laundry',body)).status,401);
 assert.equal((await guest('',{...body,organizationId:org})).status,400);
 assert.ok((await guest('/catalog?reservationId='+reservation)).body.items.some(x=>x.id===service));
 const key=randomUUID(),created=await guest('',body,key);assert.equal(created.status,200,JSON.stringify(created.body));assert.equal(created.cache,'no-store');
 assert.equal((await guest('',body,key)).body.idempotentReplay,true);let i=created.body;
 assert.equal((await staff('?propertyId='+property,undefined,2)).status,403);
 let received=await staff('/'+i.intakeId+'/actions',{action:'receive',expectedRevision:i.revision});assert.equal(received.status,200);i=received.body;
 assert.equal((await guest('/'+i.intakeId+'/actions',{action:'cancel',expectedRevision:i.revision})).status,409);
 let response=await staff('/'+i.intakeId+'/actions',{action:'quote',expectedRevision:i.revision,items:[{tag:'001',description:'Shirt',priceMinor:'18000'}],returnBy:new Date(Date.now()+6*3600000).toISOString()});assert.equal(response.status,200,JSON.stringify(response.body));i=response.body;
 assert.equal((await guest('/'+i.intakeId+'/actions',{action:'accept',expectedRevision:i.revision,expectedTotalMinor:'200'})).status,409);
 response=await guest('/'+i.intakeId+'/actions',{action:'accept',expectedRevision:i.revision,expectedTotalMinor:'18000'});assert.equal(response.status,200);i=response.body;
 for(const action of ['wash','ready','deliver']){response=await staff('/'+i.intakeId+'/actions',{action,expectedRevision:i.revision});assert.equal(response.status,200,JSON.stringify(response.body));i=response.body;}
 const receiptKey=randomUUID(),receipt={action:'confirm_receipt',expectedRevision:i.revision};response=await guest('/'+i.intakeId+'/actions',receipt,receiptKey);assert.equal(response.status,200);assert.equal(response.body.stage,'closed');
 assert.equal((await guest('/'+i.intakeId+'/actions',receipt,receiptKey)).body.idempotentReplay,true);
 assert.deepEqual((await admin.query('SELECT amount_minor::text FROM folio_entries WHERE source_id=$1',[i.orderId])).rows,[{amount_minor:'18000'}]);
 assert.equal((await guest('?reservationId='+reservation)).body.items[0].stage,'closed');
 assert.equal((await staff('?propertyId='+property)).status,200);
 console.log(JSON.stringify({result:'pass',proof:'laundry_http_core_postgres',checks:['guest_session_exact_body_idempotency','staff_scope_role_and_routes','quote_consent_frozen_order','processing_guest_receipt_one_folio_charge'],syntheticOnly:true,uiTested:false}));
};
