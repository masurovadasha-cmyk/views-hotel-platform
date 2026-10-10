import {inTenantTransaction} from "./postgres.mjs";
const statuses=new Set(["confirmed","checked_in","checked_out","cancelled"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Trusted internal PMS adapter; never call from an unauthenticated guest request. */
export async function applyPmsBookingEvent(pool,{organizationId,source,eventId,bookingReference,version,propertyId,guestPrincipalId,status,startsAt,endsAt}){
 if(!source||!eventId||!bookingReference||!guestPrincipalId||!uuid.test(propertyId)||!statuses.has(status)||!Number.isSafeInteger(version)||version<1)throw Error("Invalid PMS event");
 const start=new Date(startsAt),end=new Date(endsAt);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw Error("Invalid stay dates");
 return inTenantTransaction(pool,organizationId,async db=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[organizationId+":"+source+":"+bookingReference]);
  const inserted=await db.query("INSERT INTO service_pms_event_inbox(organization_id,source,external_event_id,booking_reference,booking_version,event_type) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",[organizationId,source,eventId,bookingReference,version,status]);
  if(!inserted.rowCount)return {applied:false,reason:"duplicate"};
  const current=await db.query("SELECT id,source_version FROM service_guest_bookings WHERE organization_id=$1 AND booking_reference=$2 FOR UPDATE",[organizationId,bookingReference]);
  if(current.rowCount&&Number(current.rows[0].source_version)>=version)return {applied:false,reason:"stale"};
  if(current.rowCount){
   await db.query("UPDATE service_guest_bookings SET property_id=$1,guest_principal_id=$2,starts_at=$3,ends_at=$4,status=$5,source=$6,source_version=$7 WHERE id=$8 AND organization_id=$9",[propertyId,guestPrincipalId,start,end,status,source,version,current.rows[0].id,organizationId]);
  }else{
   await db.query("INSERT INTO service_guest_bookings(organization_id,property_id,guest_principal_id,booking_reference,starts_at,ends_at,status,source,source_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[organizationId,propertyId,guestPrincipalId,bookingReference,start,end,status,source,version]);
  }
  return {applied:true,version};
 });
}
