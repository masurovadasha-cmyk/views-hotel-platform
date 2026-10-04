import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession,requireMutationOrigin} from "./_auth";

const allowedRoles=["maintenance_manager","front_desk","general_manager","super_admin"];
const rules:Record<string,{from:string[];to:string}>={
  review:{from:["open"],to:"review"},
  resolve:{from:["open","review"],to:"resolved"},
  close:{from:["resolved"],to:"closed"}
};

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!allowedRoles.includes(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>,id=String(body.id||""),action=String(body.action||"");
  const item=await db.prepare("SELECT id,property_id,status FROM damage_reports WHERE id=? LIMIT 1").bind(id).first<Record<string,unknown>>();
  if(!item)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(!session.propertyIds.includes(String(item.property_id))&&!["general_manager","super_admin"].includes(session.role))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  const rule=rules[action];if(!rule||!rule.from.includes(String(item.status)))return json({error:"INVALID_TRANSITION",requestId:requestId(request)},409);
  await db.batch([
    db.prepare("UPDATE damage_reports SET status=?,resolved_at=CASE WHEN ?='resolved' THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE id=?").bind(rule.to,rule.to,id),
    db.prepare("INSERT INTO operations_events(id,organization_id,property_id,aggregate_type,aggregate_id,event_type,from_status,to_status,actor_user_id,payload) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),session.organizationId,item.property_id,"damage",id,"damage."+action,item.status,rule.to,session.userId,"{}")
  ]);
  return json({id,status:rule.to,requestId:requestId(request)});
};
