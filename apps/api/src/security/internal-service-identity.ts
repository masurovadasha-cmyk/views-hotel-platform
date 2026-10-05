import {createHash} from "node:crypto";
import type {IncomingHttpHeaders} from "node:http";
import {assertInternalApiKey} from "./internal-api-auth";
import {
  verifyInternalServiceToken,
  type InternalServicePublicKey
} from "./internal-service-token";

const SERVICE_ID=/^[a-z0-9][a-z0-9._:-]{1,63}$/;

export type TrustedInternalServiceIdentity={
  serviceId:string;
  keyFingerprint:string;
  authScheme:"internal_key"|"signed_token";
  tokenJti:string|null;
};

export type InternalServiceAuthConfig={
  legacyKeys:string|readonly string[];
  serviceKeys:Readonly<Record<string,readonly string[]>>;
  servicePublicKeys?:Readonly<Record<string,readonly InternalServicePublicKey[]>>;
};

export type InternalServiceRequestMeta={
  method:string;
  path:string;
  requestId:string;
  nowSeconds?:number;
};

export type InternalServiceExpectedKeys=
  |string
  |readonly string[]
  |InternalServiceAuthConfig;

export function trustedInternalServiceIdentity(
  headers:IncomingHttpHeaders,
  expected:InternalServiceExpectedKeys,
  request?:InternalServiceRequestMeta
):TrustedInternalServiceIdentity|null{
  const rawToken=headers["x-views-service-token"];
  const rawKey=headers["x-views-internal-key"];
  if(rawToken===undefined&&rawKey===undefined)return null;

  const serviceId=singleHeader(headers["x-views-service-id"]);
  if(!serviceId||!SERVICE_ID.test(serviceId)){
    throw new Error("INTERNAL_SERVICE_ID_REQUIRED");
  }

  if(rawToken!==undefined){
    const token=singleHeader(rawToken);
    if(!token)throw new Error("INTERNAL_SERVICE_TOKEN_INVALID");
    if(!request)throw new Error("INTERNAL_SERVICE_TOKEN_BINDING_INVALID");

    const publicKeys=publicKeysForService(serviceId,expected);
    const verified=verifyInternalServiceToken({
      token,
      serviceId,
      method:request.method,
      path:request.path,
      requestId:request.requestId,
      keys:publicKeys,
      nowSeconds:request.nowSeconds
    });

    return {
      serviceId,
      keyFingerprint:verified.credentialFingerprint,
      authScheme:"signed_token",
      tokenJti:verified.jti
    };
  }

  const internalKey=singleHeader(rawKey);
  if(!internalKey)return null;

  const expectedKeys=keysForService(serviceId,expected);
  assertInternalApiKey(internalKey,expectedKeys);

  return {
    serviceId,
    keyFingerprint:createHash("sha256")
      .update(internalKey)
      .digest("hex")
      .slice(0,32),
    authScheme:"internal_key",
    tokenJti:null
  };
}

export function singleInternalHeader(value:string|string[]|undefined){
  return singleHeader(value);
}

export type InternalServiceIdentityRejectionReason=
  |"invalid_internal_key"
  |"missing_service_identity"
  |"invalid_service_identity"
  |"invalid_service_token"
  |"expired_service_token";

export function classifyInternalServiceIdentityFailure(
  headers:IncomingHttpHeaders,
  error:unknown
):InternalServiceIdentityRejectionReason{
  const code=error instanceof Error?error.message:"";
  if(code==="INTERNAL_API_UNAUTHORIZED"){
    return "invalid_internal_key";
  }

  const rawService=headers["x-views-service-id"];
  if(rawService===undefined)return "missing_service_identity";

  const serviceId=singleHeader(rawService);
  if(!serviceId||!SERVICE_ID.test(serviceId)){
    return "invalid_service_identity";
  }

  if(headers["x-views-service-token"]!==undefined){
    return code==="INTERNAL_SERVICE_TOKEN_EXPIRED"
      ?"expired_service_token"
      :"invalid_service_token";
  }

  return "invalid_service_identity";
}

function publicKeysForService(
  serviceId:string,
  expected:InternalServiceExpectedKeys
){
  if(!isServiceAuthConfig(expected)){
    throw new Error("INTERNAL_SERVICE_TOKEN_KEY_UNKNOWN");
  }
  const keys=expected.servicePublicKeys?.[serviceId];
  if(!keys?.length)throw new Error("INTERNAL_SERVICE_TOKEN_KEY_UNKNOWN");
  return keys;
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
