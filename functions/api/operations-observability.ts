import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty,isManagement} from "./_authorization";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!isManagement(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0]||"";
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const property=await db.prepare("SELECT id FROM properties WHERE id=? AND organization_id=? AND is_active=1 LIMIT 1")
    .bind(propertyId,session.organizationId).first<Record<string,unknown>>();
  if(!property)return json({error:"PROPERTY_NOT_FOUND",requestId:requestId(request)},404);

  const [outbox,serviceStale,housekeepingStale,maintenanceStale]=await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM outbox_events WHERE organization_id=? AND processed_at IS NULL").bind(session.organizationId),
    db.prepare("SELECT COUNT(*) AS count FROM service_orders WHERE organization_id=? AND property_id=? AND status NOT IN ('done','closed','cancelled') AND updated_at<datetime('now','-2 hours')").bind(session.organizationId,propertyId),
    db.prepare("SELECT COUNT(*) AS count FROM housekeeping_jobs h JOIN properties p ON p.id=h.property_id WHERE p.organization_id=? AND h.property_id=? AND h.status NOT IN ('ready','service_declined') AND h.created_at<datetime('now','-2 hours')").bind(session.organizationId,propertyId),
    db.prepare("SELECT COUNT(*) AS count FROM maintenance_tickets m JOIN properties p ON p.id=m.property_id WHERE p.organization_id=? AND m.property_id=? AND m.status!='closed' AND m.created_at<datetime('now','-2 hours')").bind(session.organizationId,propertyId)
  ]);

  const events=await db.prepare([
    "SELECT source,event_type,aggregate_id,from_status,to_status,actor_user_id,created_at FROM (",
    "SELECT 'operations' AS source,event_type,aggregate_id,from_status,to_status,actor_user_id,created_at ",
    "FROM operations_events WHERE organization_id=? AND property_id=? ",
    "UNION ALL ",
    "SELECT 'reservation' AS source,event_type,reservation_id AS aggregate_id,from_status,to_status,actor_user_id,created_at ",
    "FROM reservation_events WHERE organization_id=? AND property_id=? ",
    "UNION ALL ",
    "SELECT 'service_order' AS source,e.event_type,e.service_order_id AS aggregate_id,e.from_status,e.to_status,e.actor_user_id,e.created_at ",
    "FROM service_order_events e JOIN service_orders s ON s.id=e.service_order_id ",
    "WHERE s.organization_id=? AND s.property_id=?",
    ") ORDER BY created_at DESC LIMIT 50"
  ].join(""))
    .bind(
      session.organizationId,propertyId,
      session.organizationId,propertyId,
      session.organizationId,propertyId
    ).all();

  const count=(result:{results?:unknown[]})=>Number((result.results?.[0] as Record<string,unknown>|undefined)?.count||0);

  return json({
    propertyId,
    outboxPending:count(outbox),
    stale:{
      serviceOrders:count(serviceStale),
      housekeeping:count(housekeepingStale),
      maintenance:count(maintenanceStale)
    },
    recentEvents:events.results||[],
    requestId:requestId(request)
  });
};
