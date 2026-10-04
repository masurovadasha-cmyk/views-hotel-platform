import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty} from "./_authorization";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const unitId=new URL(request.url).searchParams.get("unitId");
  if(!unitId)return json({error:"UNIT_REQUIRED",requestId:requestId(request)},400);
  const unit=await db.prepare("SELECT u.id,u.property_id,p.organization_id FROM units u JOIN properties p ON p.id=u.property_id WHERE u.id=? LIMIT 1")
    .bind(unitId).first<Record<string,unknown>>();
  if(!unit)return json({error:"UNIT_NOT_FOUND",requestId:requestId(request)},404);
  if(String(unit.organization_id)!==session.organizationId)return json({error:"ORGANIZATION_FORBIDDEN",requestId:requestId(request)},403);
  if(!canAccessProperty(session,String(unit.property_id)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const rows=await db.prepare("SELECT event_type,from_status,to_status,payload,created_at FROM service_order_events WHERE service_order_id IN (SELECT id FROM service_orders WHERE organization_id=? AND property_id=? AND unit_id=?) ORDER BY created_at DESC LIMIT 100")
    .bind(session.organizationId,unit.property_id,unitId).all();
  return json({unitId,items:rows.results,requestId:requestId(request)});
};
