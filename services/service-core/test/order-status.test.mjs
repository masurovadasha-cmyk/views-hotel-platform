import test from "node:test";
import assert from "node:assert/strict";
import {changeOrderStatus} from "../src/order-status.mjs";
const org="11111111-1111-4111-8111-111111111111";
function setup(status="in_progress",permission=true){
 const calls=[];let released=false;
 const client={
  async query(sql,args=[]){
   calls.push({sql,args});
   if(sql.startsWith("SELECT property_id,fulfillment_status"))return {rowCount:1,rows:[{property_id:"property-1",fulfillment_status:status}]};
   if(sql.startsWith("SELECT 1 FROM service_property_access"))return {rowCount:permission?1:0,rows:permission?[{}]:[]};
   if(sql.startsWith("SELECT id,lot_id,quantity"))return {rowCount:1,rows:[{id:"reservation-1",lot_id:"lot-1",quantity:2}]};
   if(sql.startsWith("UPDATE inventory_lots")){released=true;return {rowCount:1,rows:[]}};
   return {rowCount:1,rows:[]};
  },release(){}
 };
 return {pool:{connect:async()=>client},calls,get released(){return released}};
}
test("completion consumes inventory, writes audit and outbox",async()=>{
 const s=setup();
 const result=await changeOrderStatus(s.pool,{organizationId:org,orderId:"order-1",actorId:"staff-1",nextStatus:"completed"});
 assert.equal(result.fulfillmentStatus,"completed");
 assert.ok(s.calls.some(x=>x.sql.includes("on_hand=on_hand-$1")));
 assert.ok(s.calls.some(x=>x.sql.includes("INSERT INTO service_order_audit")));
 assert.ok(s.calls.some(x=>x.sql.includes("INSERT INTO service_outbox")));
 assert.equal(s.calls.at(-2).sql,"COMMIT");
});
test("cancellation releases reserve without consuming stock",async()=>{
 const s=setup("confirmed");
 await changeOrderStatus(s.pool,{organizationId:org,orderId:"order-2",actorId:"staff-1",nextStatus:"cancelled"});
 const sql=s.calls.find(x=>x.sql.startsWith("UPDATE inventory_lots")).sql;
 assert.ok(sql.includes("reserved=reserved-$1"));assert.ok(!sql.includes("on_hand=on_hand-$1"));
});
test("unauthorized actor rolls back without stock movement",async()=>{
 const s=setup("confirmed",false);
 await assert.rejects(changeOrderStatus(s.pool,{organizationId:org,orderId:"order-3",actorId:"guest-1",nextStatus:"cancelled"}),/Forbidden/);
 assert.ok(!s.released);assert.equal(s.calls.at(-2).sql,"ROLLBACK");
});
test("invalid state transition rolls back",async()=>{
 const s=setup("completed");
 await assert.rejects(changeOrderStatus(s.pool,{organizationId:org,orderId:"order-4",actorId:"staff-1",nextStatus:"draft"}),/Invalid transition/);
 assert.equal(s.calls.at(-2).sql,"ROLLBACK");
});
