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

  const [lost,damage,stock]=await db.batch([
    db.prepare([
      "SELECT l.id,l.unit_id,u.code AS unit_code,l.item_name,l.description,l.found_location,l.found_at,l.status,l.created_at ",
      "FROM lost_found_items l LEFT JOIN units u ON u.id=l.unit_id ",
      "WHERE l.organization_id=? AND l.property_id=? AND l.status!='closed' ",
      "ORDER BY l.found_at DESC LIMIT 100"
    ].join("")).bind(session.organizationId,propertyId),
    db.prepare([
      "SELECT d.id,d.unit_id,u.code AS unit_code,d.severity,d.title,d.description,d.status,d.created_at,d.resolved_at ",
      "FROM damage_reports d LEFT JOIN units u ON u.id=d.unit_id ",
      "WHERE d.organization_id=? AND d.property_id=? AND d.status!='closed' ",
      "ORDER BY CASE d.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,d.created_at DESC LIMIT 100"
    ].join("")).bind(session.organizationId,propertyId),
    db.prepare([
      "SELECT id,category,name,sku,quantity,par_level,unit_of_measure,updated_at ",
      "FROM inventory_items WHERE organization_id=? AND property_id=? AND quantity<par_level ",
      "ORDER BY (par_level-quantity) DESC,name ASC LIMIT 100"
    ].join("")).bind(session.organizationId,propertyId)
  ]);

  return json({
    propertyId,
    lostFound:lost.results||[],
    damage:damage.results||[],
    lowStock:stock.results||[],
    requestId:requestId(request)
  });
};
