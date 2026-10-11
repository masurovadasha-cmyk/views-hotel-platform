import {json,requestId,type Env} from "./_shared";
import {requireMutationOrigin} from "./_auth";

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const raw=request.headers.get("cookie")||"";
  const match=raw.match(/(?:^|;\s*)views_session=([^;]+)/);
  if(match&&env.DB){
    await env.DB.prepare("UPDATE app_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(decodeURIComponent(match[1])).run();
  }
  return new Response(JSON.stringify({ok:true,requestId:requestId(request)}),{
    headers:{
      "Content-Type":"application/json",
      "Cache-Control":"no-store",
      "Set-Cookie":"views_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    }
  });
};
