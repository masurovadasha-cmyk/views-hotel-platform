'use strict';
const {createHash}=require('node:crypto');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
/** Read-only DB evidence; never creates a key, session, proof or audit record. */
async function readPasskeySnapshot(client,organizationId,membershipId,since){
 if(!UUID.test(organizationId)||!UUID.test(membershipId)||!Number.isFinite(Date.parse(since)))throw Error('PASSKEY_SNAPSHOT_CONTEXT_INVALID');
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const now=(await client.query('SELECT clock_timestamp() AS checked_at')).rows[0].checked_at;
  const keys=(await client.query(`SELECT k.id,k.public_key FROM staff_private.passkeys k
   JOIN public.organization_memberships m ON m.id=k.membership_id
   WHERE m.organization_id=$1 AND m.id=$2 ORDER BY k.id`,[organizationId,membershipId])).rows;
  // created_at is the real audit_log column. Each audit event must belong to
  // the SAME still-live session that carries fresh passkey assurance.
  const audit=(await client.query(`SELECT a.action FROM public.audit_log a
   JOIN staff_private.sessions s ON s.id=a.entity_id AND s.membership_id=a.actor_membership_id
   JOIN public.organization_memberships m ON m.id=s.membership_id
   JOIN staff_private.credentials c ON c.membership_id=m.id
   JOIN public.users u ON u.id=m.user_id
   WHERE a.organization_id=$1 AND a.actor_membership_id=$2 AND m.organization_id=$1
    AND a.entity_type='staff_session' AND a.action IN ('staff.passkey_registered','staff.passkey_verified')
    AND a.created_at >= $3::timestamptz AND a.created_at <= $4::timestamptz
    AND s.revoked_at IS NULL AND s.expires_at>$4 AND s.idle_expires_at>$4 AND s.passkey_verified_until>$4
    AND m.status='active' AND u.status='active' AND c.enabled AND c.version=s.credential_version AND m.role_id=s.role_id
   ORDER BY a.created_at,a.id`,[organizationId,membershipId,since,now])).rows.map(r=>r.action);
  const result={checkedAt:now.toISOString(),passkeyCount:keys.length,
   publicKeyBytes:keys.length===1?keys[0].public_key.length:0,
   keyFingerprints:keys.map(k=>createHash('sha256').update(k.id).update('\0').update(k.public_key).digest('hex')),
   auditActions:audit,sessionProofObserved:audit.length>0};
  await client.query('COMMIT');return result;
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
}
module.exports={readPasskeySnapshot};
