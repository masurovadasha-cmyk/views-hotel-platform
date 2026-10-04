import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";

const transitions:Record<string,{from:string[];to:string}>={start:{from:["open","assigned"],to:"in_progress"},wait:{from:["in_progress"],to:"waiting"},block:{from:["open","assigned","in_progress","waiting"],to:"blocked"},resolve:{from:["open","assigned","in_progress","waiting","blocked"],to:"inspection"},verify:{from:["inspection"],to:"closed"}};
const management=(role:string)=>role==="general_manager"||role==="super_admin";

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  const role=session.role,userId=session.userId;
  if(!["technician","maintenance_manager","general_manager","super_admin"].includes(role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>,id=String(body.id||""),action=String(body.action||"");
  const ticket=await db.prepare("SELECT m.id,m.property_id,m.status,m.assigned_user_id FROM maintenance_tickets m JOIN properties p ON p.id=m.property_id WHERE m.id=? AND p.organization_id=? LIMIT 1")
    .bind(id,session.organizationId).first<Record<string,unknown>>();
  if(!ticket)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(!management(role)&&!session.propertyIds.includes(String(ticket.property_id)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  if(role==="technician"&&ticket.assigned_user_id!==userId)return json({error:"NOT_ASSIGNED_TO_USER",requestId:requestId(request)},403);
  const rule=transitions[action];if(!rule||!rule.from.includes(String(ticket.status)))return json({error:"INVALID_TRANSITION",from:ticket.status,action,requestId:requestId(request)},409);
  const resolved=rule.to==="inspection"?",resolved_at=CURRENT_TIMESTAMP":"";
  await db.prepare("UPDATE maintenance_tickets SET status=?"+resolved+" WHERE id=?").bind(rule.to,id).run();
  return json({id,status:rule.to,requestId:requestId(request)});
};
