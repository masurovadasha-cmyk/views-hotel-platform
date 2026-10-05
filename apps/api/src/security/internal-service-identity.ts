import {createHash} from "node:crypto";
import type {IncomingHttpHeaders} from "node:http";
import {assertInternalApiKey} from "./internal-api-auth";

const SERVICE_ID=/^[a-z0-9][a-z0-9._:-]{1,63}$/;

export type TrustedInternalServiceIdentity={
  serviceId:string;
  keyFingerprint:string;
};

export function trustedInternalServiceIdentity(
  headers:IncomingHttpHeaders,
  expectedKeys:string|readonly string[]
):TrustedInternalServiceIdentity|null{
  const internalKey=singleHeader(headers["x-views-internal-key"]);
  if(!internalKey)return null;

  assertInternalApiKey(internalKey,expectedKeys);

  const serviceId=singleHeader(headers["x-views-service-id"]);
  if(!serviceId||!SERVICE_ID.test(serviceId)){
    throw new Error("INTERNAL_SERVICE_ID_REQUIRED");
  }

  return {
    serviceId,
    keyFingerprint:createHash("sha256")
      .update(internalKey)
      .digest("hex")
      .slice(0,32)
  };
}

export function singleInternalHeader(value:string|string[]|undefined){
  return singleHeader(value);
}

function singleHeader(value:string|string[]|undefined){
  if(value===undefined)return null;
  if(Array.isArray(value)){
    if(value.length!==1)return null;
    const normalized=value[0].trim();
    return normalized||null;
  }
  const normalized=value.trim();
  return normalized||null;
}


export type InternalServiceIdentityRejectionReason=
  |"invalid_internal_key"
  |"missing_service_identity"
  |"invalid_service_identity";

export function classifyInternalServiceIdentityFailure(
  headers:IncomingHttpHeaders,
  error:unknown
):InternalServiceIdentityRejectionReason{
  if(error instanceof Error&&error.message==="INTERNAL_API_UNAUTHORIZED"){
    return "invalid_internal_key";
  }

  const rawService=headers["x-views-service-id"];
  if(rawService===undefined)return "missing_service_identity";

  const serviceId=singleHeader(rawService);
  return serviceId?"invalid_service_identity":"missing_service_identity";
}
