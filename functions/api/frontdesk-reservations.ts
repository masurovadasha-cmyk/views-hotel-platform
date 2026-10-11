import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty} from "./_authorization";
import {canOperateFrontDesk} from "./_frontdesk";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!canOperateFrontDesk(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0]||"";
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const property=await db.prepare("SELECT id FROM properties WHERE id=? AND organization_id=? AND is_active=1 LIMIT 1")
    .bind(propertyId,session.organizationId).first<Record<string,unknown>>();
  if(!property)return json({error:"PROPERTY_NOT_FOUND",requestId:requestId(request)},404);

  const rows=await db.prepare([
    "SELECT r.id,r.confirmation_code,r.status,r.check_in_date,r.check_out_date,r.version,",
    "r.unit_id,u.code AS unit_code,u.status AS unit_status,",
    "g.id AS guest_id,g.first_name,g.last_name,g.vip,",
    "s.id AS stay_id,s.status AS stay_status,s.checked_in_at,s.checked_out_at ",
    "FROM reservations r ",
    "JOIN guests g ON g.id=r.primary_guest_id ",
    "LEFT JOIN units u ON u.id=r.unit_id ",
    "LEFT JOIN stays s ON s.reservation_id=r.id ",
    "WHERE r.organization_id=? AND r.property_id=? ",
    "AND r.status IN ('confirmed','assigned','checked_in','completed') ",
    "ORDER BY CASE r.status WHEN 'checked_in' THEN 0 WHEN 'confirmed' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END,",
    "r.check_in_date ASC,r.created_at DESC LIMIT 100"
  ].join(""))
    .bind(session.organizationId,propertyId).all();

  return json({propertyId,items:rows.results,requestId:requestId(request)});
};
