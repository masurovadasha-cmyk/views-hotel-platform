import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {isManagement} from "./_authorization";

function parseScopes(value:unknown){
  try{
    const parsed=JSON.parse(String(value||"[]"));
    return Array.isArray(parsed)?parsed.map(String):[];
  }catch{return []}
}

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!isManagement(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const rows=await db.prepare([
    "SELECT provider,status,scopes,last_health_at,last_sync_at,last_error_code,updated_at ",
    "FROM integrations WHERE organization_id=? ORDER BY provider"
  ].join("")).bind(session.organizationId).all();

  const items=(rows.results||[]).map(raw=>{
    const row=raw as Record<string,unknown>;
    return {
      provider:String(row.provider),
      status:String(row.status),
      scopes:parseScopes(row.scopes),
      lastHealthAt:row.last_health_at?String(row.last_health_at):null,
      lastSyncAt:row.last_sync_at?String(row.last_sync_at):null,
      lastErrorCode:row.last_error_code?String(row.last_error_code):null,
      updatedAt:String(row.updated_at)
    };
  });

  return json({items,requestId:requestId(request)});
};
