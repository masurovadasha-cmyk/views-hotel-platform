import test from "node:test";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {createMarketOrder,inTenantTransaction} from "../src/postgres.mjs";

if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
test("verified booking controls guest order creation and property",async()=>{
 const org=randomUUID(),unit=randomUUID(),guest="booking-test-guest",sku="WATER-15",bookingId=randomUUID();
 try{
  await inTenantTransaction(pool,org,async db=>{
   await db.query("INSERT INTO market_catalog(organization_id,sku,name,price_uzs) VALUES($1,$2,$3,$4)",[org,sku,"Вода 1,5 л",15000]);
   await db.query("INSERT INTO inventory_lots(organization_id,sku,on_hand,reserved) VALUES($1,$2,4,0)",[org,sku]);
   await db.query("INSERT INTO service_guest_bookings(id,organization_id,property_id,guest_principal_id,booking_reference,starts_at,ends_at,status) VALUES($1,$2,$3,$4,$5,now()-interval '1 day',now()+interval '1 day','checked_in')",[bookingId,org,unit,guest,"VW-TEST-"+randomUUID()]);
  });
  const make=(principalId,key)=>createMarketOrder(pool,{organizationId:org,propertyId:null,bookingId,principalId,isGuest:true,idempotencyKey:key,items:[{sku,quantity:1}],asOf:"2026-10-09"});
  await assert.rejects(make("different-guest","denied-"+randomUUID()),/Booking access denied/);
  const result=await make(guest,"allowed-"+randomUUID());
  assert.equal(result.replayed,false);
  const order=await inTenantTransaction(pool,org,async db=>(await db.query("SELECT property_id,booking_id,created_by FROM service_orders WHERE id=$1",[result.id])).rows[0]);
  assert.equal(order.property_id,unit);
  assert.equal(order.booking_id,bookingId);
  assert.equal(order.created_by,guest);
 }finally{await pool.end()}
});
