import test from "node:test";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {inTenantTransaction} from "../src/postgres.mjs";
import {createPaymentIntent} from "../src/payment-intents.mjs";
if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
test("payment intent is priced from order and idempotent",async()=>{
 const org=randomUUID(),property=randomUUID(),guest="payment-test-guest",key="payment-"+randomUUID(),orderId=randomUUID();
 try{
  await inTenantTransaction(pool,org,async db=>{
   await db.query("INSERT INTO service_orders(id,organization_id,property_id,service_type,idempotency_key,request_fingerprint,created_by,total_uzs) VALUES($1,$2,$3,'market',$4,$5,$6,45000)",[orderId,org,property,"order-"+randomUUID(),"test-fingerprint",guest]);
  });
  const first=await createPaymentIntent(pool,{organizationId:org,orderId,provider:"payme",idempotencyKey:key,actorId:guest});
  assert.equal(Number(first.amount_uzs),45000);
  const second=await createPaymentIntent(pool,{organizationId:org,orderId,provider:"payme",idempotencyKey:key,actorId:guest});
  assert.equal(second.replayed,true);
  assert.equal(first.id,second.id);
  await assert.rejects(createPaymentIntent(pool,{organizationId:org,orderId,provider:"click",idempotencyKey:key,actorId:guest}),/Idempotency conflict/);
  await assert.rejects(createPaymentIntent(pool,{organizationId:org,orderId,provider:"uzum",idempotencyKey:"other-"+randomUUID(),actorId:"another-guest"}),/Forbidden/);
 }finally{await pool.end()}
});
