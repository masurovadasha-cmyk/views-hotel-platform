import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";
import {isManagement} from "./_authorization";

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!isManagement(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);

  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;
  const id=String(body.id||"").trim();
  if(!id)return json({error:"INVALID_REQUEST",requestId:requestId(request)},400);

  const row=await db.prepare(
    "SELECT id,dead_letter_at,processed_at FROM outbox_events WHERE id=? AND organization_id=? LIMIT 1"
  ).bind(id,session.organizationId).first<Record<string,unknown>>();
  if(!row)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(row.processed_at)return json({error:"ALREADY_PROCESSED",requestId:requestId(request)},409);
  if(!row.dead_letter_at)return json({error:"NOT_DEAD_LETTERED",requestId:requestId(request)},409);

  await db.prepare([
    "UPDATE outbox_events SET attempt_count=0,available_at=CURRENT_TIMESTAMP,last_attempt_at=NULL,",
    "last_error=NULL,dead_letter_at=NULL WHERE id=? AND organization_id=? AND processed_at IS NULL"
  ].join("")).bind(id,session.organizationId).run();

  return json({id,status:"retry_scheduled",requestId:requestId(request)});
};
