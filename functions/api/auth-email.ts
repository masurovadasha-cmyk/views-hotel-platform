import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin} from "./_auth";

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>;
  const email=String(body.email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"INVALID_EMAIL",requestId:requestId(request)},400);

  const now=Math.floor(Date.now()/1000);
  const count=await db.prepare("SELECT COUNT(*) AS c FROM auth_attempts WHERE email=? AND created_unix>?")
    .bind(email,now-900).first<{c:number}>();
  if(Number(count?.c||0)>=5)return json({error:"RATE_LIMITED",retryAfterSeconds:900,requestId:requestId(request)},429);

  const token=crypto.randomUUID()+crypto.randomUUID();
  const tokenHash=await sha256(token);
  await db.batch([
    db.prepare("INSERT INTO auth_attempts(id,email,created_unix) VALUES(?,?,?)").bind(crypto.randomUUID(),email,now),
    db.prepare("INSERT INTO email_login_tokens(id,email,token_hash,expires_unix) VALUES(?,?,?,?)").bind(crypto.randomUUID(),email,tokenHash,now+900)
  ]);

  if(env.VIEWS_ENV==="staging"&&env.VIEWS_EXPOSE_LOGIN_TOKEN==="true"){
    return json({status:"staging_token_created",token,expiresIn:900,requestId:requestId(request)},201);
  }
  return json({status:"login_email_queued",expiresIn:900,requestId:requestId(request)},202);
};

async function sha256(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
