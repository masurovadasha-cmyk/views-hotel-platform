import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";
import {canAccessProperty,canVerifyMaintenance} from "./_authorization";

const transitions:Record<string,{from:string[];to:string}>={
  start:{from:["open","assigned"],to:"in_progress"},
  wait:{from:["in_progress"],to:"waiting"},
  block:{from:["open","assigned","in_progress","waiting"],to:"blocked"},
  resolve:{from:["open","assigned","in_progress","waiting","blocked"],to:"inspection"},
  verify:{from:["inspection"],to:"closed"}
};

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!["technician","maintenance_manager","general_manager","super_admin"].includes(session.role)){
    return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  }
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const body=await request.json() as Record<string,unknown>;
  const id=String(body.id||""),action=String(body.action||"");
  const ticket=await db.prepare("SELECT m.id,m.property_id,m.status,m.assigned_user_id,p.organization_id FROM maintenance_tickets m JOIN properties p ON p.id=m.property_id WHERE m.id=? LIMIT 1")
    .bind(id).first<Record<string,unknown>>();
  if(!ticket)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(String(ticket.organization_id)!==session.organizationId)return json({error:"ORGANIZATION_FORBIDDEN",requestId:requestId(request)},403);
  if(!canAccessProperty(session,String(ticket.property_id)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  if(session.role==="technician"&&ticket.assigned_user_id&&ticket.assigned_user_id!==session.userId){
    return json({error:"NOT_ASSIGNED_TO_USER",requestId:requestId(request)},403);
  }
  if(action==="verify"&&!canVerifyMaintenance(session.role)){
    return json({error:"MANAGER_REQUIRED",requestId:requestId(request)},403);
  }

  const rule=transitions[action];
  if(!rule||!rule.from.includes(String(ticket.status)))return json({error:"INVALID_TRANSITION",from:ticket.status,action,requestId:requestId(request)},409);

  const resolved=rule.to==="inspection"?",resolved_at=CURRENT_TIMESTAMP":"";
  const assignee=ticket.assigned_user_id||(session.role==="technician"&&action==="start"?session.userId:null);
  await db.batch([
    db.prepare("UPDATE maintenance_tickets SET status=?,assigned_user_id=?"+resolved+" WHERE id=?").bind(rule.to,assignee,id),
    db.prepare("INSERT INTO operations_events(id,organization_id,property_id,aggregate_type,aggregate_id,event_type,from_status,to_status,actor_user_id,payload) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),session.organizationId,ticket.property_id,"maintenance",id,"maintenance."+action,ticket.status,rule.to,session.userId,JSON.stringify({role:session.role}))
  ]);
  return json({id,status:rule.to,assignedUserId:assignee,requestId:requestId(request)});
};
