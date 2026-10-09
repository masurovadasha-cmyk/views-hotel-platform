import test from "node:test";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {createMarketOrder,inTenantTransaction} from "../src/postgres.mjs";
import {changeOrderStatus} from "../src/order-status.mjs";

const url=process.env.TEST_DATABASE_URL;
if(!url)throw Error("TEST_DATABASE_URL required for PostgreSQL integration tests");
const pool=new Pool({connectionString:url,max:8});
const org=randomUUID(),other=randomUUID(),property=randomUUID(),principal="integration-staff";
async function asTenant(tenant,fn){return inTenantTransaction(pool,tenant,fn)}
test("PostgreSQL inventory lifecycle and tenant isolation",async t=>{
 try{
  await asTenant(org,async db=>{
   await db.query("INSERT INTO market_catalog(organization_id,sku,name,price_uzs) VALUES($1,$2,$3,$4)",[org,"WATER-15","Вода 1,5 л",15000]);
   await db.query("INSERT INTO service_property_access(organization_id,property_id,principal_id,permission) VALUES($1,$2,$3,'order:create'),($1,$2,$3,'order:manage')",[org,property,principal]);
   await db.query("INSERT INTO inventory_lots(organization_id,sku,on_hand,reserved) VALUES($1,'WATER-15',3,0)",[org]);
  });
  const request={organizationId:org,propertyId:property,principalId:principal,idempotencyKey:"test-"+randomUUID(),items:[{sku:"WATER-15",quantity:2}],asOf:"2026-10-09"};
  const secondKey="test-"+randomUUID();
  const [first,second]=await Promise.allSettled([
   createMarketOrder(pool,request),
   createMarketOrder(pool,{...request,idempotencyKey:secondKey})
  ]);
  assert.equal([first,second].filter(x=>x.status==="fulfilled").length,1);
  const id=[first,second].find(x=>x.status==="fulfilled").value.id;
  const replay=await createMarketOrder(pool,{...request,idempotencyKey:first.status==="fulfilled"?request.idempotencyKey:secondKey});
  assert.equal(replay.id,id);
  const hidden=await asTenant(other,async db=>(await db.query("SELECT id FROM service_orders WHERE id=$1",[id])).rows);
  assert.equal(hidden.length,0);
  for(const nextStatus of ["awaiting_payment","confirmed","assigned","in_progress","completed"]){
   await changeOrderStatus(pool,{organizationId:org,orderId:id,actorId:principal,nextStatus});
  }
  const lot=await asTenant(org,async db=>(await db.query("SELECT on_hand,reserved FROM inventory_lots WHERE organization_id=$1 AND sku='WATER-15'",[org])).rows[0]);
  assert.equal(lot.on_hand,1);assert.equal(lot.reserved,0);
 }finally{}
});

test("PostgreSQL cancellation releases stock and rejects repeat transition",async()=>{
 const tenant=randomUUID(),unit=randomUUID(),staff="cancel-test-staff",key="cancel-"+randomUUID();
 await asTenant(tenant,async db=>{
  await db.query("INSERT INTO market_catalog(organization_id,sku,name,price_uzs) VALUES($1,$2,$3,$4)",[tenant,"MILK-1","Молоко 1 л",32000]);
  await db.query("INSERT INTO service_property_access(organization_id,property_id,principal_id,permission) VALUES($1,$2,$3,'order:create'),($1,$2,$3,'order:manage')",[tenant,unit,staff]);
  await db.query("INSERT INTO inventory_lots(organization_id,sku,on_hand,reserved) VALUES($1,'MILK-1',4,0)",[tenant]);
 });
 const created=await createMarketOrder(pool,{organizationId:tenant,propertyId:unit,principalId:staff,idempotencyKey:key,items:[{sku:"MILK-1",quantity:3}],asOf:"2026-10-09"});
 const result=await changeOrderStatus(pool,{organizationId:tenant,orderId:created.id,actorId:staff,nextStatus:"cancelled"});
 assert.equal(result.fulfillmentStatus,"cancelled");
 const lot=await asTenant(tenant,async db=>(await db.query("SELECT on_hand,reserved FROM inventory_lots WHERE organization_id=$1 AND sku='MILK-1'",[tenant])).rows[0]);
 assert.equal(lot.on_hand,4);assert.equal(lot.reserved,0);
 await assert.rejects(changeOrderStatus(pool,{organizationId:tenant,orderId:created.id,actorId:staff,nextStatus:"cancelled"}),/Invalid transition/);
 const movement=await asTenant(tenant,async db=>(await db.query("SELECT count(*)::integer AS count FROM stock_movements WHERE organization_id=$1 AND order_id=$2 AND movement_type='release'",[tenant,created.id])).rows[0]);
 assert.equal(movement.count,1);
});


test.after(async()=>{await pool.end()});
