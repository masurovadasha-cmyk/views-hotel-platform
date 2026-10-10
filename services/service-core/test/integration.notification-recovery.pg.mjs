import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {createHmac,randomUUID} from "node:crypto";
import {inTenantTransaction} from "../src/postgres.mjs";
import {enqueueNotificationEvents} from "../src/notification-worker.mjs";
import {MAX_NOTIFICATION_RECOVERY_BATCH} from "../src/notification-admin.mjs";

if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");
if(!process.env.VIEWS_AUTH_SECRET||process.env.VIEWS_AUTH_SECRET.length<32)throw Error("VIEWS_AUTH_SECRET required");
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
process.env.VIEWS_ALLOW_DEV_AUTH="1";
const {server,pool}=await import("../src/db-server.mjs");
const sign=(organizationId,sub,roles)=>{
 const payload=Buffer.from(JSON.stringify({organizationId,sub,roles,exp:Math.floor(Date.now()/1000)+600})).toString("base64url");
 return payload+"."+createHmac("sha256",process.env.VIEWS_AUTH_SECRET).update(payload).digest("base64url");
};

test("admin dead-letter recovery is tenant-scoped, audited, bounded, and rate-limited",async()=>{
 const organizationId=randomUUID(),propertyId=randomUUID(),orderId=randomUUID(),eventId=randomUUID();
 await inTenantTransaction(pool,organizationId,async db=>{
  await db.query("INSERT INTO service_orders(id,organization_id,property_id,service_type,idempotency_key,created_by) VALUES($1,$2,$3,'market',$4,'recovery-test-guest')",[orderId,organizationId,propertyId,randomUUID()]);
  await db.query("INSERT INTO service_outbox(id,organization_id,aggregate_id,event_type,payload) VALUES($1,$2,$3,'service.task.assigned',$4::jsonb)",[eventId,organizationId,orderId,JSON.stringify({kind:"market_deliver",assigneeId:"private-worker"})]);
 });
 assert.equal(await enqueueNotificationEvents(pool,{organizationId}),1);
 const job=await inTenantTransaction(pool,organizationId,async db=>(await db.query("SELECT id FROM service_notification_jobs WHERE organization_id=$1 AND source_event_id=$2",[organizationId,eventId])).rows[0]);
 await inTenantTransaction(pool,organizationId,async db=>db.query("UPDATE service_notification_jobs SET status='dead',attempts=5,last_error='projection_failed' WHERE organization_id=$1 AND id=$2",[organizationId,job.id]));

 server.listen(0,"127.0.0.1");
 await once(server,"listening");
 const base="http://127.0.0.1:"+server.address().port;
 const adminToken=sign(organizationId,"recovery-admin",["admin"]);
 const dispatcherToken=sign(organizationId,"recovery-dispatcher",["dispatcher"]);
 const route=base+"/api/v1/admin/notifications/dead-letters/requeue";
 try{
  const denied=await fetch(route,{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+dispatcherToken},body:JSON.stringify({jobIds:[job.id],reason:"Investigated transport issue"})});
  assert.equal(denied.status,403);
  const invalidReason=await fetch(route,{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+adminToken},body:JSON.stringify({jobIds:[job.id],reason:"retry"})});
  assert.equal(invalidReason.status,422);
  const tooMany=Array.from({length:MAX_NOTIFICATION_RECOVERY_BATCH+1},()=>randomUUID());
  const oversized=await fetch(route,{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+adminToken},body:JSON.stringify({jobIds:tooMany,reason:"Bounded recovery batch test"})});
  assert.equal(oversized.status,422);
  const foreign=await fetch(route,{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+sign(randomUUID(),"foreign-admin",["admin"])},body:JSON.stringify({jobIds:[job.id],reason:"Investigated transport issue"})});
  assert.equal(foreign.status,404);
  const recovered=await fetch(route,{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+adminToken},body:JSON.stringify({jobIds:[job.id],reason:"Investigated transport issue"})});
  assert.equal(recovered.status,200);
  assert.deepEqual(await recovered.json(),{requeued:1,jobIds:[job.id]});
  const state=await inTenantTransaction(pool,organizationId,async db=>(await db.query("SELECT status,attempts,last_error FROM service_notification_jobs WHERE organization_id=$1 AND id=$2",[organizationId,job.id])).rows[0]);
  assert.deepEqual(state,{status:"pending",attempts:0,last_error:null});
  const audit=await inTenantTransaction(pool,organizationId,async db=>(await db.query("SELECT actor_principal_id,reason,previous_attempts FROM service_notification_recovery_audit WHERE organization_id=$1 AND notification_job_id=$2",[organizationId,job.id])).rows[0]);
  assert.deepEqual(audit,{actor_principal_id:"recovery-admin",reason:"Investigated transport issue",previous_attempts:5});
  assert.deepEqual(await inTenantTransaction(pool,randomUUID(),async db=>(await db.query("SELECT id FROM service_notification_recovery_audit WHERE notification_job_id=$1",[job.id])).rows),[]);
  await assert.rejects(inTenantTransaction(pool,organizationId,db=>db.query("DELETE FROM service_notification_recovery_audit WHERE notification_job_id=$1",[job.id])),/append-only/);

  await inTenantTransaction(pool,organizationId,async db=>{
   await db.query("INSERT INTO service_notification_recovery_audit(organization_id,notification_job_id,actor_principal_id,reason,previous_attempts) SELECT $1,$2,'rate-limit-test','Rate limit fixture audit row',5 FROM generate_series(1,100)",[organizationId,job.id]);
   await db.query("UPDATE service_notification_jobs SET status='dead',attempts=5 WHERE organization_id=$1 AND id=$2",[organizationId,job.id]);
  });
  const rateLimited=await fetch(route,{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+adminToken},body:JSON.stringify({jobIds:[job.id],reason:"Rate limit verification"})});
  assert.equal(rateLimited.status,429);
  const stillDead=await inTenantTransaction(pool,organizationId,async db=>(await db.query("SELECT status FROM service_notification_jobs WHERE organization_id=$1 AND id=$2",[organizationId,job.id])).rows[0]);
  assert.equal(stillDead.status,"dead");
 }finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await pool.end();
 }
});
