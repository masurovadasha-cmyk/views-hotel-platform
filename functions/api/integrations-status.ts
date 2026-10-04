import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff"||!["general_manager","super_admin"].includes(session.role)){
    return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  }
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const rows=await db.prepare("SELECT provider,status,scopes,last_health_at,last_sync_at,last_error_code FROM integrations WHERE organization_id=? ORDER BY provider").bind(session.organizationId).all();
  return json({items:rows.results,requestId:requestId(request)});
};
