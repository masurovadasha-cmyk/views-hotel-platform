import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {inTenantTransaction} from "../src/postgres.mjs";
import {enqueueNotificationEvents,processNotificationJobs,MAX_NOTIFICATION_ATTEMPTS} from "../src/notification-worker.mjs";
import {listGuestNotifications} from "../src/guest-notifications.mjs";

if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
async function fixture(){
 const organizationId=randomUUID(),propertyId=randomUUID(),orderId=randomUUID(),eventId=randomUUID();
 await inTenantTransaction(pool,organizationId,async db=>{
  await db.query(
   "INSERT INTO service_orders(id,organization_id,property_id,service_type,idempotency_key,created_by) VALUES($1,$2,$3,'market',$4,'guest-worker-test')",
   [orderId,organizationId,propertyId,randomUUID()]);
  await db.query(
   "INSERT INTO service_outbox(id,organization_id,aggregate_id,event_type,payload) VALUES($1,$2,$3,'service.task.assigned',$4::jsonb)",
   [eventId,organizationId,orderId,JSON.stringify({kind:"market_deliver",assigneeId:"private-worker"})]);
 });
 return {organizationId,orderId,eventId};
}
test("worker projects once under concurrent consumers, keeps tenant and guest privacy",async()=>{
 const f=await fixture();
 assert.equal(await enqueueNotificationEvents(pool,{organizationId:f.organizationId}),1);
 assert.equal(await enqueueNotificationEvents(pool,{organizationId:f.organizationId}),0);
 const [a,b]=await Promise.all([
  processNotificationJobs(pool,{organizationId:f.organizationId,limit:1}),
  processNotificationJobs(pool,{organizationId:f.organizationId,limit:1})
 ]);
 assert.equal(a.completed+b.completed,1);
 const own=await listGuestNotifications(pool,{organizationId:f.organizationId,principalId:"guest-worker-test"});
 assert.equal(own.length,1);
 assert.equal(own[0].message,"Назначена доставка");
 assert.ok(!JSON.stringify(own).includes("private-worker"));
 assert.deepEqual(await listGuestNotifications(pool,{organizationId:f.organizationId,principalId:"other-guest"}),[]);
 assert.deepEqual(await listGuestNotifications(pool,{organizationId:randomUUID(),principalId:"guest-worker-test"}),[]);
 assert.equal((await processNotificationJobs(pool,{organizationId:f.organizationId})).completed,0);
});
test("worker retries bounded projection failures and dead-letters without leaking exception",async()=>{
 const f=await fixture();
 assert.equal(await enqueueNotificationEvents(pool,{organizationId:f.organizationId}),1);
 for(let attempt=1;attempt<=MAX_NOTIFICATION_ATTEMPTS;attempt++){
  const outcome=await processNotificationJobs(pool,{organizationId:f.organizationId,limit:1,project:()=>{throw Error("private exception with credentials")}});
  assert.equal(outcome[attempt===MAX_NOTIFICATION_ATTEMPTS?"dead":"retried"],1);
  const job=await inTenantTransaction(pool,f.organizationId,async db=>(await db.query("SELECT status,attempts,last_error FROM service_notification_jobs WHERE source_event_id=$1",[f.eventId])).rows[0]);
  assert.equal(job.attempts,attempt);
  assert.equal(job.last_error,"projection_failed");
  assert.equal(job.status,attempt===MAX_NOTIFICATION_ATTEMPTS?"dead":"pending");
  if(attempt<MAX_NOTIFICATION_ATTEMPTS){
   await inTenantTransaction(pool,f.organizationId,db=>db.query("UPDATE service_notification_jobs SET next_attempt_at=now()-interval '1 second' WHERE source_event_id=$1",[f.eventId]));
  }
 }
 assert.deepEqual(await listGuestNotifications(pool,{organizationId:f.organizationId,principalId:"guest-worker-test"}),[]);
 assert.equal((await processNotificationJobs(pool,{organizationId:f.organizationId})).completed,0);
});
test.after(async()=>pool.end());
