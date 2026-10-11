import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";
import {canAccessProperty,canVerifyHousekeeping} from "./_authorization";

const transitions:Record<string,{from:string[];to:string}>={
  start:{from:["dirty"],to:"cleaning"},
  complete:{from:["cleaning"],to:"inspection"},
  verify:{from:["inspection"],to:"ready"},
  dnd:{from:["dirty","cleaning"],to:"dnd"},
  decline:{from:["dirty"],to:"service_declined"}
};

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!["cleaner","housekeeping_supervisor","general_manager","super_admin"].includes(session.role)){
    return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  }
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const body=await request.json() as Record<string,unknown>;
  const id=String(body.id||""),action=String(body.action||"");
  const job=await db.prepare("SELECT h.id,h.property_id,h.unit_id,h.status,h.assigned_user_id,p.organization_id FROM housekeeping_jobs h JOIN properties p ON p.id=h.property_id WHERE h.id=? LIMIT 1")
    .bind(id).first<Record<string,unknown>>();
  if(!job)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(String(job.organization_id)!==session.organizationId)return json({error:"ORGANIZATION_FORBIDDEN",requestId:requestId(request)},403);
  if(!canAccessProperty(session,String(job.property_id)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  if(session.role==="cleaner"&&job.assigned_user_id&&job.assigned_user_id!==session.userId){
    return json({error:"NOT_ASSIGNED_TO_USER",requestId:requestId(request)},403);
  }
  if(action==="verify"&&!canVerifyHousekeeping(session.role)){
    return json({error:"SUPERVISOR_REQUIRED",requestId:requestId(request)},403);
  }

  const rule=transitions[action];
  if(!rule||!rule.from.includes(String(job.status)))return json({error:"INVALID_TRANSITION",from:job.status,action,requestId:requestId(request)},409);

  const stamps=rule.to==="cleaning"?",started_at=CURRENT_TIMESTAMP"
    :rule.to==="inspection"?",completed_at=CURRENT_TIMESTAMP"
    :rule.to==="ready"?",verified_at=CURRENT_TIMESTAMP":"";
  const assignee=job.assigned_user_id||(session.role==="cleaner"&&action==="start"?session.userId:null);
  const unitStatus=rule.to==="service_declined"?"dirty":rule.to;

  await db.batch([
    db.prepare("UPDATE housekeeping_jobs SET status=?,assigned_user_id=?"+stamps+" WHERE id=?").bind(rule.to,assignee,id),
    db.prepare("UPDATE units SET status=? WHERE id=? AND property_id=?").bind(unitStatus,job.unit_id,job.property_id),
    db.prepare("INSERT INTO operations_events(id,organization_id,property_id,aggregate_type,aggregate_id,event_type,from_status,to_status,actor_user_id,payload) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),session.organizationId,job.property_id,"housekeeping",id,"housekeeping."+action,job.status,rule.to,session.userId,JSON.stringify({role:session.role,unitStatus}))
  ]);
  return json({id,status:rule.to,assignedUserId:assignee,requestId:requestId(request)});
};
