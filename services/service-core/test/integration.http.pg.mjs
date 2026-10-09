import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {createHmac,randomUUID} from "node:crypto";
import {inTenantTransaction} from "../src/postgres.mjs";

if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");
if(!process.env.VIEWS_AUTH_SECRET||process.env.VIEWS_AUTH_SECRET.length<32)throw Error("VIEWS_AUTH_SECRET required");
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
const {server,pool}=await import("../src/db-server.mjs");
const sign=(organizationId,sub,roles)=>{
 const body=Buffer.from(JSON.stringify({organizationId,sub,roles,exp:Math.floor(Date.now()/1000)+600})).toString("base64url");
 return body+"."+createHmac("sha256",process.env.VIEWS_AUTH_SECRET).update(body).digest("base64url");
};
test("CRM serves assets, enforces roles, and cancels reserved order",async()=>{
 const org=randomUUID(),property=randomUUID(),staff="crm-integration-staff";
 await inTenantTransaction(pool,org,async db=>{
  await db.query("INSERT INTO market_catalog(organization_id,sku,name,price_uzs) VALUES($1,$2,$3,$4)",[org,"WATER-15","Вода 1,5 л",15000]);
  await db.query("INSERT INTO service_property_access(organization_id,property_id,principal_id,permission) VALUES($1,$2,$3,'order:create'),($1,$2,$3,'order:manage')",[org,property,staff]);
  await db.query("INSERT INTO inventory_lots(organization_id,sku,on_hand,reserved) VALUES($1,'WATER-15',5,0)",[org]);
 });
 server.listen(0,"127.0.0.1");
 await once(server,"listening");
 const base="http://127.0.0.1:"+server.address().port;
 const staffToken=sign(org,staff,["dispatcher"]),guestToken=sign(org,"guest-1",["guest"]);
 try{
  const page=await fetch(base+"/crm");
  assert.equal(page.status,200);
  assert.match(await page.text(),/crm\.css/);
  assert.match(page.headers.get("content-security-policy"),/style-src 'self'/);
  const stylesheet=await fetch(base+"/crm.css");
  assert.equal(stylesheet.status,200);
  assert.match(stylesheet.headers.get("content-type"),/text\/css/);
  const unauthorized=await fetch(base+"/api/v1/service-orders");
  assert.equal(unauthorized.status,401);
  const forbidden=await fetch(base+"/api/v1/service-orders",{headers:{Authorization:"Bearer "+guestToken}});
  assert.equal(forbidden.status,403);
  const catalog=await fetch(base+"/api/v1/market/catalog",{headers:{Authorization:"Bearer "+guestToken}});
  assert.equal(catalog.status,200);
  assert.equal((await catalog.json())[0].priceUzs,15000);
  const key="http-"+randomUUID();
  const request={method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+staffToken,"Idempotency-Key":key},body:JSON.stringify({propertyId:property,items:[{sku:"WATER-15",quantity:2}]})};
  const created=await fetch(base+"/api/v1/service-orders",request);
  assert.equal(created.status,201);
  const order=await created.json();
  const storedPrice=await inTenantTransaction(pool,org,async db=>(await db.query("SELECT total_uzs,delivery_fee_uzs FROM service_orders WHERE id=$1",[order.id])).rows[0]);
  assert.equal(Number(storedPrice.total_uzs),45000);
  assert.equal(Number(storedPrice.delivery_fee_uzs),15000);
  const snapshot=await inTenantTransaction(pool,org,async db=>(await db.query("SELECT unit_price_uzs FROM service_order_items WHERE order_id=$1",[order.id])).rows[0]);
  assert.equal(Number(snapshot.unit_price_uzs),15000);
  await inTenantTransaction(pool,org,async db=>db.query("UPDATE market_catalog SET price_uzs=$1 WHERE organization_id=$2 AND sku=$3",[19000,org,"WATER-15"]));
  const originalSnapshot=await inTenantTransaction(pool,org,async db=>(await db.query("SELECT unit_price_uzs FROM service_order_items WHERE order_id=$1",[order.id])).rows[0]);
  assert.equal(Number(originalSnapshot.unit_price_uzs),15000);
  const guestRead=await fetch(base+"/api/v1/service-orders/"+order.id,{headers:{Authorization:"Bearer "+guestToken}});
  assert.equal(guestRead.status,404);
  const staffRead=await fetch(base+"/api/v1/service-orders/"+order.id,{headers:{Authorization:"Bearer "+staffToken}});
  assert.equal(staffRead.status,200);
  const guestPage=await fetch(base+"/guest");
  assert.equal(guestPage.status,200);
  const guestJs=await fetch(base+"/guest.js");
  assert.equal(guestJs.status,200);
  const replay=await fetch(base+"/api/v1/service-orders",request);
  assert.equal(replay.status,200);
  assert.equal((await replay.json()).id,order.id);
  const listed=await fetch(base+"/api/v1/service-orders",{headers:{Authorization:"Bearer "+staffToken}});
  assert.equal(listed.status,200);
  assert.ok((await listed.json()).some(x=>x.id===order.id));
  const cancelled=await fetch(base+"/api/v1/service-orders/"+order.id,{method:"PATCH",headers:{"content-type":"application/json",Authorization:"Bearer "+staffToken},body:JSON.stringify({fulfillmentStatus:"cancelled"})});
  assert.equal(cancelled.status,200);
  assert.equal((await cancelled.json()).fulfillmentStatus,"cancelled");
  const inventory=await inTenantTransaction(pool,org,async db=>(await db.query("SELECT on_hand,reserved FROM inventory_lots WHERE organization_id=$1 AND sku='WATER-15'",[org])).rows[0]);
  assert.deepEqual(inventory,{on_hand:5,reserved:0});
 }finally{
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  await pool.end();
 }
});
