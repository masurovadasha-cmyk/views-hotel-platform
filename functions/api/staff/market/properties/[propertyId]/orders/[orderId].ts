import {resolveSession} from "../../../../../_auth";
import {canAccessProperty,isManagement} from "../../../../../_authorization";
import {coreApiConfig,resolveCoreActor,resolveCoreProperty,CoreBridgeError} from "../../../../../_core-bridge";
import {createCoreServiceToken} from "../../../../../_core-service-token";
import {json,requestId,type Env} from "../../../../../_shared";
import {validateCoreMarketDetail} from "../../../../../_market-response";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedRoles=new Set(["front_desk","concierge","reservation_manager","general_manager","super_admin"]);
type Context={request:Request;env:Env;params:Record<string,string|undefined>};

/**
 * Pages same-origin BFF. Browser authenticates with views_session cookie;
 * only the server signs the upstream Core request.
 * No direct browser access to internal Core headers or credentials.
 */
export const onRequestGet=async({request,env,params}:Context)=>{
 const rid=crypto.randomUUID();
 const session=await resolveSession(request,env);
 if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
 if(!allowedRoles.has(session.role))return json({error:"STAFF_ROLE_FORBIDDEN",requestId:requestId(request)},403);
 const localProperty=params.propertyId||"";
 const orderId=params.orderId||"";
 if(!canAccessProperty(session,localProperty))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
 if(!UUID.test(orderId))return json({error:"INVALID_ORDER_ID",requestId:requestId(request)},400);
 try{
  const [actor,coreProperty,config]=await Promise.all([
   resolveCoreActor(session,env),
   resolveCoreProperty(session,env,localProperty),
   Promise.resolve().then(()=>coreApiConfig(env))
  ]);
  const path="/v1/internal/market/properties/"+coreProperty+"/orders/"+orderId;
  // Require request-bound signed identity; legacy shared keys are not used by this route.
  if(!config.signingPrivateKey||!config.signingKid)throw new CoreBridgeError("CORE_SIGNED_IDENTITY_REQUIRED");
  const token=await createCoreServiceToken({
   serviceId:"pages-bff",kid:config.signingKid,privateKeyPem:config.signingPrivateKey,
   method:"GET",path,requestId:rid
  });
  const response=await fetch(config.baseUrl+path,{
   method:"GET",redirect:"error",signal:AbortSignal.timeout(8000),
   headers:{
    "Accept":"application/json",
    "x-views-service-id":"pages-bff",
    "x-views-service-token":token,
    "x-organization-id":actor.organizationId,
    "x-user-id":actor.userId,
    "x-membership-id":actor.membershipId,
    "x-request-id":rid
   }
  });
  if(response.status===401||response.status===403)return json({error:"STAFF_FORBIDDEN",requestId:requestId(request)},403);
  if(response.status===404)return json({error:"ORDER_NOT_FOUND",requestId:requestId(request)},404);
  if(!response.ok)return json({error:"CORE_ORDER_UNAVAILABLE",requestId:requestId(request)},502);
  if(!(response.headers.get("content-type")||"").toLowerCase().includes("application/json"))
   return json({error:"CORE_INVALID_RESPONSE",requestId:requestId(request)},502);
  const raw=await response.text();
  if(raw.length>131072)return json({error:"CORE_RESPONSE_TOO_LARGE",requestId:requestId(request)},502);
  let data:unknown;
  try{data=JSON.parse(raw)}catch{return json({error:"CORE_INVALID_RESPONSE",requestId:requestId(request)},502)}
  // Validate at the server boundary before forwarding any Core data.
  if(!validateCoreMarketDetail(data,coreProperty,orderId))
   return json({error:"CORE_INVALID_RESPONSE",requestId:requestId(request)},502);
  return json(data);
 }catch(error){
  if(error instanceof CoreBridgeError){
   const forbidden=["PROPERTY_FORBIDDEN"].includes(error.code);
   return json({error:forbidden?"PROPERTY_FORBIDDEN":"CORE_BRIDGE_NOT_READY",requestId:requestId(request)},forbidden?403:503);
  }
  return json({error:"CORE_ORDER_UNAVAILABLE",requestId:requestId(request)},502);
 }
};
