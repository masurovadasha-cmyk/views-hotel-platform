import {resolveSession} from "./_auth";
import {CoreBridgeError,coreApiConfig,resolveCoreActor,resolveCoreProperty} from "./_core-bridge";
import {createCoreServiceToken} from "./_core-service-token";
import {json,requestId,type Env} from "./_shared";

/** Staff-only BFF: never exposes the Core signing key to the browser. */
export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
 const rid=requestId(request);
 const session=await resolveSession(request,env);
 if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:rid},401);
 try{
  const localPropertyId=new URL(request.url).searchParams.get("propertyId")||"";
  if(!localPropertyId)return json({error:"PROPERTY_REQUIRED",requestId:rid},400);
  const actor=await resolveCoreActor(session,env);
  const corePropertyId=await resolveCoreProperty(session,env,localPropertyId);
  const config=coreApiConfig(env);
  const url=new URL("/v1/internal/market/properties/"+encodeURIComponent(corePropertyId)+"/orders",config.baseUrl);
  const rawLimit=new URL(request.url).searchParams.get("limit");
  if(rawLimit!==null){
   const limit=Number(rawLimit);
   if(!Number.isSafeInteger(limit)||limit<1||limit>100)return json({error:"INVALID_LIMIT",requestId:rid},400);
   url.searchParams.set("limit",String(limit));
  }
  const headers=new Headers({
   "Accept":"application/json",
   "X-Views-Service-Id":"pages-bff",
   "X-Organization-Id":actor.organizationId,
   "X-User-Id":actor.userId,
   "X-Membership-Id":actor.membershipId,
   "X-Request-Id":rid
  });
  if(config.signingPrivateKey&&config.signingKid){
   headers.set("X-Views-Service-Token",await createCoreServiceToken({
    serviceId:"pages-bff",kid:config.signingKid,privateKeyPem:config.signingPrivateKey,
    method:"GET",path:url.pathname,requestId:rid
   }));
  }else if(config.internalKey)headers.set("X-Views-Internal-Key",config.internalKey);
  let response:Response;
  try{response=await fetch(url,{method:"GET",headers,redirect:"error"})}
  catch{return json({error:"CORE_API_UNAVAILABLE",requestId:rid},502)}
  if(!response.ok)return json({error:response.status===403?"PROPERTY_FORBIDDEN":"CORE_API_ERROR",requestId:rid},response.status===403?403:502);
  let body:unknown;
  try{body=await response.json()}catch{return json({error:"CORE_API_INVALID_RESPONSE",requestId:rid},502)}
  return json(body,200);
 }catch(error){
  if(error instanceof CoreBridgeError)return json({error:error.code,requestId:rid},error.code==="PROPERTY_FORBIDDEN"?403:503);
  return json({error:"CORE_BRIDGE_ERROR",requestId:rid},500);
 }
};
