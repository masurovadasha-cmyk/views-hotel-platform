import {inTenantTransaction} from "./postgres.mjs";

export const MAX_NOTIFICATION_RECOVERY_BATCH=25;
export const MAX_NOTIFICATION_RECOVERIES_PER_15_MINUTES=100;

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateRecoveryRequest({organizationId,jobIds,actorId,reason}){
 if(!uuid.test(organizationId||""))throw Object.assign(Error("Invalid organization"),{status:422});
 if(!Array.isArray(jobIds)||jobIds.length<1||jobIds.length>MAX_NOTIFICATION_RECOVERY_BATCH||jobIds.some(id=>typeof id!=="string"||!uuid.test(id)))throw Object.assign(Error("Invalid dead-letter batch"),{status:422});
 const normalizedIds=jobIds.map(id=>id.toLowerCase());
 if(new Set(normalizedIds).size!==normalizedIds.length)throw Object.assign(Error("Duplicate dead-letter id"),{status:422});
 if(typeof actorId!=="string"||actorId.length<1||actorId.length>256)throw Object.assign(Error("Invalid actor"),{status:422});
 if(typeof reason!=="string"||reason.trim().length<10||reason.trim().length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason))throw Object.assign(Error("Recovery reason must be 10 to 500 characters"),{status:422});
 return {organizationId,jobIds:normalizedIds,actorId,reason:reason.trim()};
}

/** Requeue only tenant-owned dead jobs and append immutable per-job audit records. */
export async function requeueDeadLetterNotifications(pool,input){
 const request=validateRecoveryRequest(input||{});
 return inTenantTransaction(pool,request.organizationId,async db=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["notification-recovery:"+request.organizationId]);
  const recent=await db.query("SELECT count(*)::integer AS count FROM service_notification_recovery_audit WHERE organization_id=$1 AND created_at>now()-interval '15 minutes'",[request.organizationId]);
  if(Number(recent.rows[0].count)+request.jobIds.length>MAX_NOTIFICATION_RECOVERIES_PER_15_MINUTES)throw Object.assign(Error("Notification recovery rate limit exceeded"),{status:429});
  const selected=await db.query("SELECT id FROM service_notification_jobs WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND status='dead' ORDER BY id FOR UPDATE",[request.organizationId,request.jobIds]);
  if(selected.rowCount!==request.jobIds.length)throw Object.assign(Error("Dead-letter not found"),{status:404});
  const audited=await db.query(
   `WITH selected AS (
      SELECT id,attempts FROM service_notification_jobs
      WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND status='dead'
     ), updated AS (
      UPDATE service_notification_jobs j
      SET status='pending',attempts=0,next_attempt_at=now(),last_error=NULL,completed_at=NULL
      FROM selected s
      WHERE j.organization_id=$1 AND j.id=s.id
      RETURNING j.id,s.attempts
     )
     INSERT INTO service_notification_recovery_audit
       (organization_id,notification_job_id,actor_principal_id,reason,previous_attempts)
     SELECT $1,id,$3,$4,attempts FROM updated RETURNING notification_job_id`,
   [request.organizationId,request.jobIds,request.actorId,request.reason]);
  if(audited.rowCount!==request.jobIds.length)throw Error("Dead-letter recovery conflict");
  return {requeued:audited.rowCount,jobIds:audited.rows.map(row=>row.notification_job_id)};
 });
}

export function validateNotificationRecoveryRequest(input){validateRecoveryRequest(input);return true}
