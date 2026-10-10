import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty} from "./_authorization";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const unitId=new URL(request.url).searchParams.get("unitId");
  if(!unitId)return json({error:"UNIT_REQUIRED",requestId:requestId(request)},400);
  const unit=await db.prepare("SELECT u.id,u.property_id,u.code,u.name,u.status,p.organization_id FROM units u JOIN properties p ON p.id=u.property_id WHERE u.id=? LIMIT 1")
    .bind(unitId).first<Record<string,unknown>>();
  if(!unit)return json({error:"UNIT_NOT_FOUND",requestId:requestId(request)},404);
  if(String(unit.organization_id)!==session.organizationId)return json({error:"ORGANIZATION_FORBIDDEN",requestId:requestId(request)},403);
  if(!canAccessProperty(session,String(unit.property_id)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const propertyId=String(unit.property_id);
  const sql=[
    "SELECT source,event_type,from_status,to_status,payload,created_at FROM (",
    "SELECT 'reservation' AS source,e.event_type,e.from_status,e.to_status,e.payload,e.created_at ",
    "FROM reservation_events e JOIN reservations r ON r.id=e.reservation_id ",
    "WHERE e.organization_id=? AND e.property_id=? AND r.unit_id=? ",
    "UNION ALL ",
    "SELECT 'service_order' AS source,e.event_type,e.from_status,e.to_status,e.payload,e.created_at ",
    "FROM service_order_events e JOIN service_orders s ON s.id=e.service_order_id ",
    "WHERE s.organization_id=? AND s.property_id=? AND s.unit_id=? ",
    "UNION ALL ",
    "SELECT 'housekeeping' AS source,o.event_type,o.from_status,o.to_status,o.payload,o.created_at ",
    "FROM operations_events o JOIN housekeeping_jobs h ON h.id=o.aggregate_id ",
    "WHERE o.organization_id=? AND o.property_id=? AND o.aggregate_type='housekeeping' AND h.unit_id=? ",
    "UNION ALL ",
    "SELECT 'maintenance' AS source,o.event_type,o.from_status,o.to_status,o.payload,o.created_at ",
    "FROM operations_events o JOIN maintenance_tickets m ON m.id=o.aggregate_id ",
    "WHERE o.organization_id=? AND o.property_id=? AND o.aggregate_type='maintenance' AND m.unit_id=?",
    ") ORDER BY created_at DESC LIMIT 200"
  ].join("");

  const rows=await db.prepare(sql).bind(
    session.organizationId,propertyId,unitId,
    session.organizationId,propertyId,unitId,
    session.organizationId,propertyId,unitId,
    session.organizationId,propertyId,unitId
  ).all();

  return json({
    unit:{id:String(unit.id),propertyId,code:String(unit.code),name:String(unit.name),status:String(unit.status)},
    items:rows.results||[],
    requestId:requestId(request)
  });
};
