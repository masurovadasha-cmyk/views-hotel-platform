import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";

const transitions:Record<string,{from:string[];to:string}>={start:{from:["dirty"],to:"cleaning"},complete:{from:["cleaning"],to:"inspection"},verify:{from:["inspection"],to:"ready"},dnd:{from:["dirty","cleaning"],to:"dnd"},decline:{from:["dirty"],to:"service_declined"}};
const management=(role:string)=>role==="general_manager"||role==="super_admin";

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  const role=session.role,userId=session.userId;
  if(!["cleaner","housekeeping_supervisor","general_manager","super_admin"].includes(role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>,id=String(body.id||""),action=String(body.action||"");
  const job=await db.prepare("SELECT h.id,h.property_id,h.status,h.assigned_user_id FROM housekeeping_jobs h JOIN properties p ON p.id=h.property_id WHERE h.id=? AND p.organization_id=? LIMIT 1")
    .bind(id,session.organizationId).first<Record<string,unknown>>();
  if(!job)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(!management(role)&&!session.propertyIds.includes(String(job.property_id)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  if(role==="cleaner"&&job.assigned_user_id!==userId)return json({error:"NOT_ASSIGNED_TO_USER",requestId:requestId(request)},403);
  const rule=transitions[action];if(!rule||!rule.from.includes(String(job.status)))return json({error:"INVALID_TRANSITION",from:job.status,action,requestId:requestId(request)},409);
  const stamps=rule.to==="cleaning"?",started_at=CURRENT_TIMESTAMP":rule.to==="inspection"?",completed_at=CURRENT_TIMESTAMP":rule.to==="ready"?",verified_at=CURRENT_TIMESTAMP":"";
  await db.prepare("UPDATE housekeeping_jobs SET status=?"+stamps+" WHERE id=?").bind(rule.to,id).run();
  return json({id,status:rule.to,requestId:requestId(request)});
};
