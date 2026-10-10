import test from "node:test";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {inTenantTransaction} from "../src/postgres.mjs";
import {createPaymentIntent} from "../src/payment-intents.mjs";
import {applyVerifiedPaymentEvent} from "../src/payment-events.mjs";
if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
test("verified payment event is idempotent and marks order paid",async()=>{
 const organizationId=randomUUID(),propertyId=randomUUID(),actorId="payment-event-test",orderId=randomUUID();
 try{
  await inTenantTransaction(pool,organizationId,async db=>{
   await db.query("INSERT INTO service_orders(id,organization_id,property_id,service_type,idempotency_key,request_fingerprint,created_by,total_uzs) VALUES($1,$2,$3,'market',$4,'test-fingerprint',$5,45000)",[orderId,organizationId,propertyId,"order-"+randomUUID(),actorId]);
  });
  const intent=await createPaymentIntent(pool,{organizationId,orderId,provider:"payme",idempotencyKey:"payment-"+randomUUID(),actorId});
  const first=await applyVerifiedPaymentEvent(pool,{organizationId,intentId:intent.id,providerEventId:"provider-event-1",eventType:"succeeded"});
  assert.equal(first.applied,true);
  const replay=await applyVerifiedPaymentEvent(pool,{organizationId,intentId:intent.id,providerEventId:"provider-event-1",eventType:"succeeded"});
  assert.equal(replay.reason,"duplicate");
  const contradictory=await applyVerifiedPaymentEvent(pool,{organizationId,intentId:intent.id,providerEventId:"provider-event-2",eventType:"failed"});
  assert.equal(contradictory.reason,"terminal");
  const order=await inTenantTransaction(pool,organizationId,async db=>(await db.query("SELECT payment_status FROM service_orders WHERE id=$1",[orderId])).rows[0]);
  assert.equal(order.payment_status,"paid");
  const events=await inTenantTransaction(pool,organizationId,async db=>(await db.query("SELECT count(*)::integer AS count FROM service_outbox WHERE aggregate_id=$1 AND event_type='payment.intent.updated'",[orderId])).rows[0]);
  assert.equal(events.count,1);
 }finally{await pool.end()}
});
