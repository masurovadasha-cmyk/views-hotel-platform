import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty,isManagement} from "./_authorization";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!isManagement(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const url=new URL(request.url);
  const propertyId=url.searchParams.get("propertyId")||session.propertyIds[0]||"";
  const reservationId=url.searchParams.get("reservationId")||"";
  if(!reservationId)return json({error:"RESERVATION_REQUIRED",requestId:requestId(request)},400);
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const reservation=await db.prepare([
    "SELECT r.id,r.confirmation_code,r.status,r.check_in_date,r.check_out_date,r.version,r.currency,",
    "p.name AS property_name,p.city,u.id AS unit_id,u.code AS unit_code,u.name AS unit_name,u.status AS unit_status,",
    "g.id AS guest_id,g.first_name,g.last_name,g.email,g.phone,g.vip,",
    "s.id AS stay_id,s.status AS stay_status,s.checked_in_at,s.checked_out_at ",
    "FROM reservations r JOIN properties p ON p.id=r.property_id ",
    "JOIN guests g ON g.id=r.primary_guest_id LEFT JOIN units u ON u.id=r.unit_id ",
    "LEFT JOIN stays s ON s.reservation_id=r.id ",
    "WHERE r.id=? AND r.organization_id=? AND r.property_id=? LIMIT 1"
  ].join("")).bind(reservationId,session.organizationId,propertyId).first<Record<string,unknown>>();
  if(!reservation)return json({error:"RESERVATION_NOT_FOUND",requestId:requestId(request)},404);

  const unitId=String(reservation.unit_id||"");
  const [orders,maintenance,housekeeping]=await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM service_orders WHERE reservation_id=? AND organization_id=? AND status NOT IN ('done','closed','cancelled')")
      .bind(reservationId,session.organizationId),
    db.prepare("SELECT COUNT(*) AS count FROM maintenance_tickets WHERE property_id=? AND unit_id=? AND status!='closed'")
      .bind(propertyId,unitId),
    db.prepare("SELECT id,status,assigned_user_id,created_at,started_at,completed_at,verified_at FROM housekeeping_jobs WHERE property_id=? AND unit_id=? ORDER BY created_at DESC LIMIT 1")
      .bind(propertyId,unitId)
  ]);

  const count=(result:{results?:unknown[]})=>Number((result.results?.[0] as Record<string,unknown>|undefined)?.count||0);
  const latestHousekeeping=(housekeeping.results?.[0] as Record<string,unknown>|undefined)??null;

  return json({
    reservation,
    operations:{
      openServiceOrders:count(orders),
      openMaintenance:count(maintenance),
      latestHousekeeping
    },
    requestId:requestId(request)
  });
};
