import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin} from "./_auth";

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>;
  const token=String(body.token||"");
  if(token.length<20)return json({error:"INVALID_TOKEN",requestId:requestId(request)},400);

  const hash=await sha256(token),now=Math.floor(Date.now()/1000);
  const login=await db.prepare("SELECT id,email FROM email_login_tokens WHERE token_hash=? AND used_at IS NULL AND expires_unix>? LIMIT 1")
    .bind(hash,now).first<Record<string,unknown>>();
  if(!login)return json({error:"TOKEN_INVALID_OR_EXPIRED",requestId:requestId(request)},401);

  const email=String(login.email);
  const staff=await db.prepare("SELECT u.id,u.organization_id,s.role,s.property_id FROM app_users u JOIN staff_roles s ON s.user_id=u.id WHERE u.email=? AND u.is_active=1 LIMIT 1")
    .bind(email).first<Record<string,unknown>>();
  const guest=staff?null:await db.prepare("SELECT id,organization_id FROM guests WHERE lower(email)=? LIMIT 1")
    .bind(email).first<Record<string,unknown>>();
  if(!staff&&!guest)return json({error:"ACCOUNT_NOT_FOUND",requestId:requestId(request)},404);

  const sid=crypto.randomUUID();
  const expiresAt=new Date(Date.now()+12*3600*1000).toISOString();

  if(staff){
    await db.prepare("INSERT INTO app_sessions(id,user_id,role,organization_id,property_ids,expires_at) VALUES(?,?,?,?,?,?)")
      .bind(sid,staff.id,staff.role,staff.organization_id,JSON.stringify([staff.property_id]),expiresAt).run();
  }else{
    await db.prepare("INSERT INTO app_sessions(id,user_id,guest_id,organization_id,property_ids,expires_at) VALUES(?,?,?,?,?,?)")
      .bind(sid,"guest:"+guest!.id,guest!.id,guest!.organization_id,"[]",expiresAt).run();
  }

  await db.prepare("UPDATE email_login_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?").bind(login.id).run();

  return new Response(JSON.stringify({authenticated:true,expiresAt,requestId:requestId(request)}),{
    headers:{
      "Content-Type":"application/json",
      "Cache-Control":"no-store",
      "Set-Cookie":`views_session=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`
    }
  });
};

async function sha256(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
