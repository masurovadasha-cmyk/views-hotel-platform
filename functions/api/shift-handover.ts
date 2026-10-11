import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession,requireMutationOrigin} from "./_auth";
import {canAccessProperty} from "./_authorization";

const allowedRoles=["front_desk","housekeeping_supervisor","maintenance_manager","reservation_manager","general_manager","super_admin"];


function parseList(value:unknown){
  try{
    const parsed=JSON.parse(String(value||"[]"));
    return Array.isArray(parsed)?parsed:[];
  }catch{return []}
}

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!allowedRoles.includes(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0]||"";
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const rows=await db.prepare([
    "SELECT id,property_id,from_shift,to_shift,unresolved_json,risks_json,follow_up_json,",
    "created_by,acknowledged_by,created_at,acknowledged_at ",
    "FROM shift_handovers WHERE organization_id=? AND property_id=? ",
    "ORDER BY created_at DESC LIMIT 50"
  ].join("")).bind(session.organizationId,propertyId).all();

  const items=(rows.results||[]).map(raw=>{
    const row=raw as Record<string,unknown>;
    return {
      id:String(row.id),
      property_id:String(row.property_id),
      from_shift:String(row.from_shift),
      to_shift:String(row.to_shift),
      unresolved:parseList(row.unresolved_json),
      risks:parseList(row.risks_json),
      followUp:parseList(row.follow_up_json),
      created_by:row.created_by?String(row.created_by):null,
      acknowledged_by:row.acknowledged_by?String(row.acknowledged_by):null,
      created_at:String(row.created_at),
      acknowledged_at:row.acknowledged_at?String(row.acknowledged_at):null
    };
  });

  return json({propertyId,items,requestId:requestId(request)});
};

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!allowedRoles.includes(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const body=await request.json() as Record<string,unknown>;
  const propertyId=String(body.propertyId||session.propertyIds[0]||"");
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const property=await db.prepare("SELECT id,organization_id FROM properties WHERE id=? LIMIT 1").bind(propertyId).first<Record<string,unknown>>();
  if(!property)return json({error:"PROPERTY_NOT_FOUND",requestId:requestId(request)},404);
  if(String(property.organization_id)!==session.organizationId)return json({error:"ORGANIZATION_FORBIDDEN",requestId:requestId(request)},403);

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
  const row=await db.prepare("SELECT id,organization_id,property_id,acknowledged_at FROM shift_handovers WHERE id=? LIMIT 1")
    .bind(id).first<Record<string,unknown>>();
  if(!row)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(String(row.organization_id)!==session.organizationId)return json({error:"ORGANIZATION_FORBIDDEN",requestId:requestId(request)},403);
  if(!canAccessProperty(session,String(row.property_id)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  if(row.acknowledged_at)return json({error:"ALREADY_ACKNOWLEDGED",requestId:requestId(request)},409);

  await db.batch([
    db.prepare("UPDATE shift_handovers SET acknowledged_by=?,acknowledged_at=CURRENT_TIMESTAMP WHERE id=?").bind(session.userId,id),
    db.prepare("INSERT INTO operations_events(id,organization_id,property_id,aggregate_type,aggregate_id,event_type,actor_user_id,payload) VALUES(?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),session.organizationId,row.property_id,"handover",id,"handover.acknowledged",session.userId,"{}")
  ]);
  return json({id,status:"acknowledged",requestId:requestId(request)});
};
