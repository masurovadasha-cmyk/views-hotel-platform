import {resolveSession} from "./_auth";
import {CoreBridgeError,coreApiConfig,resolveCoreActor,resolveCoreProperty} from "./_core-bridge";
import {json,requestId,type Env} from "./_shared";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const rid=requestId(request);
  const session=await resolveSession(request,env);
  if(!session)return json({error:"UNAUTHORIZED",requestId:rid},401);
  if(session.mode!=="staff")return json({error:"STAFF_REQUIRED",requestId:rid},403);

  try{
    const actor=await resolveCoreActor(session,env);
    const config=coreApiConfig(env);
    const input=new URL(request.url);
    const from=input.searchParams.get("from");
    const to=input.searchParams.get("to");
    const localPropertyId=input.searchParams.get("propertyId");

    if(!from||!to)return json({error:"DATE_RANGE_REQUIRED",requestId:rid},400);

    const coreUrl=new URL("/v1/analytics/dashboard/summary",config.baseUrl);
    coreUrl.searchParams.set("from",from);
    coreUrl.searchParams.set("to",to);

    if(localPropertyId){
      const corePropertyId=await resolveCoreProperty(session,env,localPropertyId);
      coreUrl.searchParams.set("propertyId",corePropertyId);
    }

    const headers=new Headers({
      "Accept":"application/json",
      "X-Views-Internal-Key":config.internalKey,
      "X-Organization-Id":actor.organizationId,
      "X-User-Id":actor.userId,
      "X-Membership-Id":actor.membershipId,
      "X-Request-Id":rid
    });
    const conditional=request.headers.get("if-none-match");
    if(conditional)headers.set("If-None-Match",conditional);

    let upstream:Response;
    try{
      upstream=await fetch(coreUrl,{method:"GET",headers,redirect:"error"});
    }catch{
      return json({error:"CORE_API_UNAVAILABLE",requestId:rid},502);
    }

    const responseHeaders=new Headers({
      "Cache-Control":"private, no-cache, must-revalidate",
      "X-Content-Type-Options":"nosniff"
    });
    const etag=upstream.headers.get("etag");
    if(etag)responseHeaders.set("ETag",etag);

    if(upstream.status===304){
      return new Response(null,{status:304,headers:responseHeaders});
    }

    const text=await upstream.text();
    responseHeaders.set(
      "Content-Type",
      upstream.headers.get("content-type")?.startsWith("application/json")
        ?"application/json; charset=utf-8"
        :"application/json; charset=utf-8"
    );

    if(!upstream.ok){
      const body=safeUpstreamError(text);
      return new Response(JSON.stringify({...body,requestId:rid}),{
        status:upstream.status>=400&&upstream.status<600?upstream.status:502,
        headers:responseHeaders
      });
    }

    let data:unknown;
    try{data=JSON.parse(text)}catch{
      return json({error:"CORE_API_INVALID_RESPONSE",requestId:rid},502);
    }

    return new Response(JSON.stringify(data),{status:200,headers:responseHeaders});
  }catch(error){
    if(error instanceof CoreBridgeError){
      const status=error.code==="PROPERTY_FORBIDDEN"?403:503;
      return json({error:error.code,requestId:rid},status);
    }
    return json({error:"CORE_BRIDGE_ERROR",requestId:rid},500);
  }
};

function safeUpstreamError(text:string){
  try{
    const parsed=JSON.parse(text) as Record<string,unknown>;
    const message=typeof parsed.message==="string"?parsed.message:undefined;
    const error=typeof parsed.error==="string"?parsed.error:undefined;
    return {error:error||message||"CORE_API_ERROR"};
  }catch{
    return {error:"CORE_API_ERROR"};
  }
}
