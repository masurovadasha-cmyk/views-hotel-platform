import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession,requireMutationOrigin} from "./_auth";

const allowedRoles=["front_desk","housekeeping_supervisor","maintenance_manager","reservation_manager","general_manager","super_admin"];

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!allowedRoles.includes(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>;
  const propertyId=String(body.propertyId||session.propertyIds[0]||"");
  if(!propertyId||(!session.propertyIds.includes(propertyId)&&!["general_manager","super_admin"].includes(session.role)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  const id=crypto.randomUUID();
  const unresolved=Array.isArray(body.unresolved)?body.unresolved.slice(0,100):[];
  const risks=Array.isArray(body.risks)?body.risks.slice(0,100):[];
  const followUp=Array.isArray(body.followUp)?body.followUp.slice(0,100):[];
  await db.batch([
    db.prepare("INSERT INTO shift_handovers(id,organization_id,property_id,from_shift,to_shift,unresolved_json,risks_json,follow_up_json,created_by) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(id,session.organizationId,propertyId,String(body.fromShift||"current"),String(body.toShift||"next"),JSON.stringify(unresolved),JSON.stringify(risks),JSON.stringify(followUp),session.userId),
    db.prepare("INSERT INTO operations_events(id,organization_id,property_id,aggregate_type,aggregate_id,event_type,actor_user_id,payload) VALUES(?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),session.organizationId,propertyId,"handover",id,"handover.created",session.userId,JSON.stringify({unresolved:unresolved.length,risks:risks.length,followUp:followUp.length}))
  ]);
  return json({id,status:"created",requestId:requestId(request)},201);
};

export const onRequestPatch=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!allowedRoles.includes(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>,id=String(body.id||"");
  const row=await db.prepare("SELECT id,property_id,acknowledged_at FROM shift_handovers WHERE id=? LIMIT 1").bind(id).first<Record<string,unknown>>();
  if(!row)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(row.acknowledged_at)return json({error:"ALREADY_ACKNOWLEDGED",requestId:requestId(request)},409);
  await db.batch([
    db.prepare("UPDATE shift_handovers SET acknowledged_by=?,acknowledged_at=CURRENT_TIMESTAMP WHERE id=?").bind(session.userId,id),
    db.prepare("INSERT INTO operations_events(id,organization_id,property_id,aggregate_type,aggregate_id,event_type,actor_user_id,payload) VALUES(?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),session.organizationId,row.property_id,"handover",id,"handover.acknowledged",session.userId,"{}")
  ]);
  return json({id,status:"acknowledged",requestId:requestId(request)});
};
