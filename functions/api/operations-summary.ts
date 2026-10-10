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

  const [lost,damage,stock,orders]=await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM lost_found_items WHERE organization_id=? AND property_id=? AND status='pending'").bind(session.organizationId,propertyId),
    db.prepare("SELECT COUNT(*) AS count FROM damage_reports WHERE organization_id=? AND property_id=? AND status!='closed'").bind(session.organizationId,propertyId),
    db.prepare("SELECT COUNT(*) AS count FROM inventory_items WHERE organization_id=? AND property_id=? AND quantity<par_level").bind(session.organizationId,propertyId),
    db.prepare("SELECT COUNT(*) AS count FROM service_orders WHERE organization_id=? AND property_id=? AND status NOT IN ('done','closed','cancelled')").bind(session.organizationId,propertyId)
  ]);
  const count=(r:{results?:unknown[]})=>Number((r.results?.[0] as Record<string,unknown>|undefined)?.count||0);
  return json({propertyId,lostFoundOpen:count(lost),damageOpen:count(damage),inventoryLow:count(stock),serviceOrdersOpen:count(orders),requestId:requestId(request)});
};
