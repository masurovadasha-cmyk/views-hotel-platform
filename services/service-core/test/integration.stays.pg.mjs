import test from "node:test";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {createMarketOrder,inTenantTransaction} from "../src/postgres.mjs";

if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
const org=randomUUID(),property=randomUUID(),guest="verified-guest",sku="WATER-15";
const make=(key)=>createMarketOrder(pool,{organizationId:org,propertyId:property,principalId:guest,isGuest:true,idempotencyKey:key,items:[{sku,quantity:1}],asOf:"2026-10-09"});
test("guest market order requires a verified active stay",async()=>{
 try{
  await inTenantTransaction(pool,org,async db=>{
   await db.query("INSERT INTO market_catalog(organization_id,sku,name,price_uzs) VALUES($1,$2,$3,$4)",[org,sku,"Вода 1,5 л",15000]);
   await db.query("INSERT INTO inventory_lots(organization_id,sku,on_hand,reserved) VALUES($1,$2,5,0)",[org,sku]);
  });
  await assert.rejects(make("denied-"+randomUUID()),/Forbidden/);
  await inTenantTransaction(pool,org,async db=>{
   await db.query("INSERT INTO service_guest_stays(organization_id,property_id,principal_id,booking_reference,starts_at,ends_at,state) VALUES($1,$2,$3,$4,now()-interval '1 day',now()+interval '1 day','checked_in')",[org,property,guest,"VW-TEST-BOOKING"]);
  });
  const result=await make("allowed-"+randomUUID());
  assert.equal(result.replayed,false);
 }finally{await pool.end()}
});
