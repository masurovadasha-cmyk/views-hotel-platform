import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {server} from "../src/server.mjs";

test("market API: catalog, order creation, replay and CRM lifecycle",async()=>{
 server.listen(0,"127.0.0.1");await once(server,"listening");
 const base="http://127.0.0.1:"+server.address().port;
 try{
  const catalog=await fetch(base+"/api/v1/catalog");
  assert.equal(catalog.status,200);
  const products=await catalog.json();
  assert.ok(products.some(x=>x.sku==="WATER-15"));
  const key="test-order-"+Date.now();
  const options={method:"POST",headers:{"content-type":"application/json","Idempotency-Key":key},body:JSON.stringify({items:[{sku:"WATER-15",quantity:2}]})};
  const created=await fetch(base+"/api/v1/service-orders",options);
  assert.equal(created.status,201);
  const order=await created.json();
  assert.equal(order.totalUzs,45000);
  const replay=await fetch(base+"/api/v1/service-orders",options);
  assert.equal(replay.status,200);
  assert.equal((await replay.json()).id,order.id);
  const conflict=await fetch(base+"/api/v1/service-orders",{...options,body:JSON.stringify({items:[{sku:"WATER-15",quantity:3}]})});
  assert.equal(conflict.status,409);
  const list=await fetch(base+"/api/v1/service-orders");
  assert.ok((await list.json()).some(x=>x.id===order.id));
  const invalid=await fetch(base+"/api/v1/service-orders/"+order.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({fulfillmentStatus:"completed"})});
  assert.equal(invalid.status,409);
  const valid=await fetch(base+"/api/v1/service-orders/"+order.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({fulfillmentStatus:"awaiting_payment"})});
  assert.equal(valid.status,200);
 }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))}
});
