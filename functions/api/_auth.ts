import {json,requestId,type Env} from "./_shared";

export type LiveSession=
 | {mode:"guest";userId:string;guestId:string;organizationId:string}
 | {mode:"staff";userId:string;role:string;organizationId:string;propertyIds:string[]};

export async function resolveSession(request:Request,env:Env):Promise<LiveSession|null>{
  const sessionId=getCookie(request,"views_session");
  if(sessionId&&env.DB){
    const row=await env.DB.prepare("SELECT id,user_id,guest_id,role,organization_id,property_ids,expires_at FROM app_sessions WHERE id=? AND revoked_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP LIMIT 1")
      .bind(sessionId).first<Record<string,unknown>>();
    if(row){
      if(row.guest_id){
        return {mode:"guest",userId:String(row.user_id),guestId:String(row.guest_id),organizationId:String(row.organization_id)};
      }
      if(!row.role)return null;
      return {
        mode:"staff",
        userId:String(row.user_id),
        role:String(row.role),
        organizationId:String(row.organization_id),
        propertyIds:parsePropertyIds(row.property_ids)
      };
    }
  }
  if(env.VIEWS_ENV==="staging"&&env.VIEWS_ALLOW_DEMO_HEADERS==="true"){
    const role=request.headers.get("x-views-demo-role");
    if(role==="guest")return {mode:"guest",userId:"guest-demo",guestId:"guest-demo",organizationId:"views"};
    if(role)return {mode:"staff",userId:request.headers.get("x-views-user-id")||"staff-demo",role,organizationId:"views",propertyIds:["utower"]};
  }
  return null;
}

export function requireMutationOrigin(request:Request,env:Env){
  const origin=request.headers.get("origin");
  const allowed=(env.VIEWS_ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(!origin||!allowed.includes(origin))return json({error:"ORIGIN_FORBIDDEN",requestId:requestId(request)},403);
  return null;
}

function parsePropertyIds(raw:unknown){
  try{
    const parsed=JSON.parse(String(raw||"[]"));
    if(!Array.isArray(parsed))return [];
    return [...new Set(parsed.map(String).filter(Boolean))];
  }catch{return []}
}

function getCookie(request:Request,name:string){
  const cookie=request.headers.get("cookie")||"";
  for(const part of cookie.split(";")){
    const [k,...rest]=part.trim().split("=");
    if(k===name)return decodeURIComponent(rest.join("="));
  }
  return null;
}
