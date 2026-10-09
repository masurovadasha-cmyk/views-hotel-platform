import test from "node:test";
import assert from "node:assert/strict";
import {createMarketOrder} from "../src/postgres.mjs";
const ORG="11111111-1111-4111-8111-111111111111";
const PROPERTY="22222222-2222-4222-8222-222222222222";
function fakePool(){
 const calls=[];let stored=null;let stock=8;
 const client={
  async query(sql,args=[]){
   calls.push({sql,args});
   if(sql.startsWith("SELECT 1 FROM service_property_access"))return {rowCount:1,rows:[{one:1}]};
   if(sql.startsWith("SELECT price_uzs FROM market_catalog"))return {rowCount:1,rows:[{price_uzs:15000}]};
   if(sql.startsWith("SELECT id,property_id"))return {rowCount:stored?1:0,rows:stored?[stored]:[]};
   if(sql.startsWith("INSERT INTO service_orders")){stored={id:"order-1",property_id:args[1],service_type:"market",request_fingerprint:args[3]};return {rows:[{id:stored.id}]};}
   if(sql.startsWith("SELECT id,on_hand"))return {rows:[{id:"lot-1",on_hand:stock,reserved:0}]};
   if(sql.startsWith("UPDATE inventory_lots"))stock-=args[0];
   return {rows:[],rowCount:1};
  },release(){}
 };
 return {pool:{connect:async()=>client},calls};
}
test("persists line item and outbox event",async()=>{
 const {pool,calls}=fakePool();
 const result=await createMarketOrder(pool,{organizationId:ORG,propertyId:PROPERTY,principalId:"test-user",idempotencyKey:"key-123456",items:[{sku:"WATER-15",quantity:2}],asOf:"2026-10-09"});
 assert.equal(result.replayed,false);
 assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO service_order_items")));
 assert.ok(calls.some(x=>x.sql.includes("INSERT INTO service_outbox")));
});
test("retry with same payload does not reserve again",async()=>{
 const {pool,calls}=fakePool();const request={organizationId:ORG,propertyId:PROPERTY,principalId:"test-user",idempotencyKey:"key-123456",items:[{sku:"WATER-15",quantity:2}],asOf:"2026-10-09"};
 await createMarketOrder(pool,request);const second=await createMarketOrder(pool,request);
 assert.equal(second.replayed,true);
 assert.equal(calls.filter(x=>x.sql.startsWith("UPDATE inventory_lots")).length,1);
});
test("same key different quantity rejected",async()=>{
 const {pool}=fakePool();const request={organizationId:ORG,propertyId:PROPERTY,principalId:"test-user",idempotencyKey:"key-123456",items:[{sku:"WATER-15",quantity:2}],asOf:"2026-10-09"};
 await createMarketOrder(pool,request);
 await assert.rejects(createMarketOrder(pool,{...request,items:[{sku:"WATER-15",quantity:3}]}),/Idempotency conflict/);
});
