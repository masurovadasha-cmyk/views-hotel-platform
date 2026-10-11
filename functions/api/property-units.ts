import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty} from "./_authorization";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0]||"";
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const rows=await db.prepare([
    "SELECT u.id,u.code,u.name,u.status,u.capacity,u.bedrooms ",
    "FROM units u JOIN properties p ON p.id=u.property_id ",
    "WHERE u.property_id=? AND p.organization_id=? AND p.is_active=1 ",
    "ORDER BY u.code ASC LIMIT 500"
  ].join("")).bind(propertyId,session.organizationId).all();
  return json({propertyId,items:rows.results||[],requestId:requestId(request)});
};
