import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty} from "./_authorization";

const allowedRoles=["technician","maintenance_manager","general_manager","super_admin"];

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!allowedRoles.includes(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0]||"";
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const property=await db.prepare("SELECT id FROM properties WHERE id=? AND organization_id=? AND is_active=1 LIMIT 1")
    .bind(propertyId,session.organizationId).first<Record<string,unknown>>();
  if(!property)return json({error:"PROPERTY_NOT_FOUND",requestId:requestId(request)},404);

  const base=[
    "SELECT m.id,m.property_id,m.unit_id,u.code AS unit_code,m.assigned_user_id,m.title,m.description,",
    "m.priority,m.status,m.created_at,m.resolved_at ",
    "FROM maintenance_tickets m LEFT JOIN units u ON u.id=m.unit_id ",
    "WHERE m.property_id=? "
  ].join("");
  const own=session.role==="technician";
  const sql=base+(own?"AND m.assigned_user_id=? ":"")+"ORDER BY m.created_at DESC LIMIT 100";
  const rows=own
    ?await db.prepare(sql).bind(propertyId,session.userId).all()
    :await db.prepare(sql).bind(propertyId).all();

  return json({propertyId,items:rows.results,requestId:requestId(request)});
};
