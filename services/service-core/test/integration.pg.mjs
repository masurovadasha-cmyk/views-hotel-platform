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
 }finally{await pool.end()}
});
