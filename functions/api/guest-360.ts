import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty} from "./_authorization";
import {canOperateFrontDesk} from "./_frontdesk";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!canOperateFrontDesk(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const url=new URL(request.url);
  const propertyId=url.searchParams.get("propertyId")||session.propertyIds[0]||"";
  const guestId=url.searchParams.get("guestId")||"";
  if(!guestId)return json({error:"GUEST_REQUIRED",requestId:requestId(request)},400);
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const guest=await db.prepare([
    "SELECT g.id,g.first_name,g.last_name,g.email,g.phone,g.vip,g.created_at ",
    "FROM guests g WHERE g.id=? AND g.organization_id=? ",
    "AND EXISTS(SELECT 1 FROM reservations r WHERE r.primary_guest_id=g.id AND r.property_id=? AND r.organization_id=?) ",
    "LIMIT 1"
  ].join("")).bind(guestId,session.organizationId,propertyId,session.organizationId).first<Record<string,unknown>>();
  if(!guest)return json({error:"GUEST_NOT_FOUND",requestId:requestId(request)},404);

  const reservations=await db.prepare([
    "SELECT r.id,r.confirmation_code,r.status,r.check_in_date,r.check_out_date,r.unit_id,u.code AS unit_code,",
    "s.status AS stay_status,s.checked_in_at,s.checked_out_at ",
    "FROM reservations r LEFT JOIN units u ON u.id=r.unit_id LEFT JOIN stays s ON s.reservation_id=r.id ",
    "WHERE r.primary_guest_id=? AND r.organization_id=? AND r.property_id=? ",
    "ORDER BY r.check_in_date DESC,r.created_at DESC LIMIT 50"
  ].join("")).bind(guestId,session.organizationId,propertyId).all();

  const service=await db.prepare([
    "SELECT COUNT(*) AS count FROM service_orders ",
    "WHERE guest_id=? AND organization_id=? AND property_id=? AND status NOT IN ('done','closed','cancelled')"
  ].join("")).bind(guestId,session.organizationId,propertyId).first<{count:number}>();

  return json({
    guest,
    reservations:reservations.results||[],
    openServiceOrders:Number(service?.count||0),
    requestId:requestId(request)
  });
};
