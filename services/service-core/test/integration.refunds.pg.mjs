import test from "node:test";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {inTenantTransaction} from "../src/postgres.mjs";
import {requestRefund} from "../src/refunds.mjs";
if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
test("refund requests cannot exceed a captured payment",async()=>{
 const org=randomUUID(),property=randomUUID(),orderId=randomUUID(),intentId=randomUUID();
 try{
  await inTenantTransaction(pool,org,async db=>{
   await db.query("INSERT INTO service_orders(id,organization_id,property_id,service_type,idempotency_key,request_fingerprint,created_by,total_uzs) VALUES($1,$2,$3,'market',$4,'test-fingerprint','refund-test',45000)",[orderId,org,property,"order-"+randomUUID()]);
   await db.query("INSERT INTO service_payment_intents(id,organization_id,order_id,provider,amount_uzs,status,idempotency_key) VALUES($1,$2,$3,'payme',45000,'succeeded',$4)",[intentId,org,orderId,"payment-"+randomUUID()]);
  });
  const first=await requestRefund(pool,{organizationId:org,intentId,amountUzs:20000,reason:"Partial refund"});
  assert.equal(Number(first.amount_uzs),20000);
  await assert.rejects(requestRefund(pool,{organizationId:org,intentId,amountUzs:30000,reason:"Over limit"}),/Refund exceeds payment/);
  const second=await requestRefund(pool,{organizationId:org,intentId,amountUzs:25000,reason:"Remaining balance"});
  assert.equal(Number(second.amount_uzs),25000);
 }finally{await pool.end()}
});
