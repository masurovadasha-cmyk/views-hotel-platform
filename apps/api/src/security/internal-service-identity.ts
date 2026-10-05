import {createHash} from "node:crypto";
import type {IncomingHttpHeaders} from "node:http";
import {assertInternalApiKey} from "./internal-api-auth";

const SERVICE_ID=/^[a-z0-9][a-z0-9._:-]{1,63}$/;

export type TrustedInternalServiceIdentity={
  serviceId:string;
  keyFingerprint:string;
};

export type InternalServiceAuthConfig={
  legacyKeys:string|readonly string[];
  serviceKeys:Readonly<Record<string,readonly string[]>>;
};

export type InternalServiceExpectedKeys=
  |string
  |readonly string[]
  |InternalServiceAuthConfig;

export function trustedInternalServiceIdentity(
  headers:IncomingHttpHeaders,
  expected:InternalServiceExpectedKeys
):TrustedInternalServiceIdentity|null{
  const internalKey=singleHeader(headers["x-views-internal-key"]);
  if(!internalKey)return null;

  const serviceId=singleHeader(headers["x-views-service-id"]);
  if(!serviceId||!SERVICE_ID.test(serviceId)){
    throw new Error("INTERNAL_SERVICE_ID_REQUIRED");
  }

  const expectedKeys=keysForService(serviceId,expected);
  assertInternalApiKey(internalKey,expectedKeys);

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

function keysForService(
  serviceId:string,
  expected:InternalServiceExpectedKeys
){
  if(isServiceAuthConfig(expected)){
    const services=Object.keys(expected.serviceKeys);
    if(services.length>0){
      const keys=expected.serviceKeys[serviceId];
      if(!keys?.length)throw new Error("INTERNAL_SERVICE_NOT_CONFIGURED");
      return keys;
    }
    return expected.legacyKeys;
  }
  return expected;
}

function isServiceAuthConfig(
  value:InternalServiceExpectedKeys
):value is InternalServiceAuthConfig{
  return typeof value==="object"&&!Array.isArray(value)&&
    "legacyKeys" in value&&"serviceKeys" in value;
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
