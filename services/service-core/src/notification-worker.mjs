import {inTenantTransaction} from "./postgres.mjs";
import {notificationMessage,notificationEventTypes} from "./guest-notifications.mjs";

export const MAX_NOTIFICATION_ATTEMPTS=5;

/** Register a bounded set of eligible events, safe to call repeatedly. */
export async function enqueueNotificationEvents(pool,{organizationId,limit=100}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error("Invalid batch limit");
 return inTenantTransaction(pool,organizationId,async db=>{
  const result=await db.query(
   `WITH candidates AS (
      SELECT e.id
      FROM service_outbox e
      JOIN service_orders o ON o.organization_id=e.organization_id AND o.id=e.aggregate_id
      WHERE e.organization_id=$1 AND o.created_by IS NOT NULL
        AND e.event_type=ANY($2::text[])
        AND NOT EXISTS (
          SELECT 1 FROM service_notification_jobs j
          WHERE j.organization_id=e.organization_id AND j.source_event_id=e.id
        )
      ORDER BY e.created_at,e.id LIMIT $3
     )
     INSERT INTO service_notification_jobs(organization_id,source_event_id)
     SELECT $1,id FROM candidates
     ON CONFLICT(organization_id,source_event_id) DO NOTHING
     RETURNING id`,
   [organizationId,notificationEventTypes,limit]);
  return result.rowCount;
 });
}

/** Process one event per transaction; SKIP LOCKED prevents duplicate claims. */
export async function processNotificationJobs(pool,{organizationId,limit=25,project=notificationMessage}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error("Invalid batch limit");
 const summary={completed:0,retried:0,dead:0};
 for(let i=0;i<limit;i++){
  const outcome=await inTenantTransaction(pool,organizationId,async db=>{
   const found=await db.query(
    `SELECT j.id,j.source_event_id,j.attempts
       FROM service_notification_jobs j
       WHERE j.organization_id=$1 AND j.status='pending' AND j.next_attempt_at<=now()
       ORDER BY j.next_attempt_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,
    [organizationId]);
   if(!found.rowCount)return null;
   const job=found.rows[0];
   const result=await db.query(
    `SELECT e.id,e.aggregate_id,e.event_type,e.payload,e.created_at,o.created_by
       FROM service_outbox e JOIN service_orders o
         ON o.organization_id=e.organization_id AND o.id=e.aggregate_id
       WHERE e.organization_id=$1 AND e.id=$2`,
    [organizationId,job.source_event_id]);
   if(!result.rowCount)throw Error("Source event missing");
   const event=result.rows[0];
   let message;
   try{message=project(event)}
   catch{
    const attempts=job.attempts+1;
    const dead=attempts>=MAX_NOTIFICATION_ATTEMPTS;
    await db.query(
     `UPDATE service_notification_jobs SET status=$1,attempts=$2,last_error='projection_failed',
        next_attempt_at=now()+($3::integer * interval '1 second')
        WHERE organization_id=$4 AND id=$5`,
     [dead?"dead":"pending",attempts,Math.min(3600,2**attempts*15),organizationId,job.id]);
    return dead?"dead":"retried";
   }
   if(message){
    await db.query(
     `INSERT INTO service_guest_notifications
      (organization_id,guest_principal_id,order_id,source_event_id,event_type,message,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(organization_id,guest_principal_id,source_event_id) DO NOTHING`,
     [organizationId,event.created_by,event.aggregate_id,event.id,event.event_type,message,event.created_at]);
   }
   await db.query(
    "UPDATE service_notification_jobs SET status='completed',attempts=attempts+1,completed_at=now(),last_error=NULL WHERE organization_id=$1 AND id=$2",
    [organizationId,job.id]);
   return "completed";
  });
  if(outcome===null)break;
  summary[outcome]++;
 }
 return summary;
}
