import test from "node:test";
import assert from "node:assert/strict";
import {finalizeMarketReservations} from "../src/inventory-finalization.mjs";
const organizationId="11111111-1111-4111-8111-111111111111",orderId="22222222-2222-4222-8222-222222222222";
function pool(){
 const calls=[];let active=true;
 const client={async query(sql,args){calls.push({sql,args});
  if(sql.startsWith("SELECT id FROM service_orders"))return {rowCount:1,rows:[{id:orderId}]};
  if(sql.includes("FROM inventory_reservations"))return {rowCount:active?1:0,rows:active?[{id:"reservation",lot_id:"lot",quantity:2}]:[]};
  if(sql.startsWith("UPDATE inventory_reservations"))active=false;
  return {rowCount:1,rows:[]};
 },release(){}};
 return {pool:{connect:async()=>client},calls};
}
test("release reduces reserved but not on_hand",async()=>{const x=pool();await finalizeMarketReservations(x.pool,{organizationId,orderId,action:"release"});assert.ok(x.calls.some(c=>c.sql.includes("SET reserved=reserved-$1 WHERE")));assert.ok(x.calls.some(c=>c.args?.includes("release")))});
test("consume reduces reserved and on_hand",async()=>{const x=pool();await finalizeMarketReservations(x.pool,{organizationId,orderId,action:"consume"});assert.ok(x.calls.some(c=>c.sql.includes("on_hand=on_hand-$1")))});
test("repeated finalization is no-op",async()=>{const x=pool();const a={organizationId,orderId,action:"release"};await finalizeMarketReservations(x.pool,a);assert.deepEqual(await finalizeMarketReservations(x.pool,a),{processed:0,alreadyFinalized:true})});
test("invalid action rejected",async()=>{await assert.rejects(finalizeMarketReservations(pool().pool,{organizationId,orderId,action:"writeoff"}),/Invalid/)});
