import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty} from "./_authorization";

const allowedRoles=["cleaner","housekeeping_supervisor","general_manager","super_admin"];

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
    "SELECT h.id,h.property_id,h.unit_id,u.code AS unit_code,h.reservation_id,h.assigned_user_id,",
    "h.status,h.created_at,h.started_at,h.completed_at,h.verified_at ",
    "FROM housekeeping_jobs h JOIN units u ON u.id=h.unit_id ",
    "WHERE h.property_id=? "
  ].join("");
  const own=session.role==="cleaner";
  const sql=base+(own?"AND h.assigned_user_id=? ":"")+"ORDER BY h.created_at DESC LIMIT 100";
  const rows=own
    ?await db.prepare(sql).bind(propertyId,session.userId).all()
    :await db.prepare(sql).bind(propertyId).all();

  return json({propertyId,items:rows.results,requestId:requestId(request)});
};
