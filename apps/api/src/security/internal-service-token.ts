import {
  createHash,createPublicKey,verify as verifySignature,type KeyObject
} from "node:crypto";

const SERVICE_ID=/^[a-z0-9][a-z0-9._:-]{1,63}$/;
const KID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const REQUEST_ID=/^[A-Za-z0-9._:/-]{1,160}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TTL_SECONDS=60;
const CLOCK_SKEW_SECONDS=5;
const TOKEN_TYP="views-service+jwt";
const TOKEN_AUD="views-core";

export type InternalServicePublicKey={
  kid:string;
  publicKeyPem:string;
};

export type InternalServiceTokenClaims={
  iss:string;
  sub:string;
  aud:"views-core";
  iat:number;
  exp:number;
  jti:string;
  htm:string;
  htp:string;
  rid:string;
};

export type VerifiedInternalServiceToken={
  serviceId:string;
  kid:string;
  credentialFingerprint:string;
  jti:string;
  issuedAt:number;
  expiresAt:number;
};

export function verifyInternalServiceToken(input:{
  token:string;
  serviceId:string;
  method:string;
  path:string;
  requestId:string;
  keys:readonly InternalServicePublicKey[];
  nowSeconds?:number;
}):VerifiedInternalServiceToken{
  if(!SERVICE_ID.test(input.serviceId)){
    throw new Error("INTERNAL_SERVICE_ID_REQUIRED");
  }

  const parts=input.token.split(".");
  if(parts.length!==3||parts.some(part=>!part)){
    throw new Error("INTERNAL_SERVICE_TOKEN_INVALID");
  }

  const header=parseJsonSegment(parts[0]);
  const claims=parseJsonSegment(parts[1]);

  if(
    header.alg!=="EdDSA"||
    header.typ!==TOKEN_TYP||
    typeof header.kid!=="string"||
    !KID.test(header.kid)
  ){
    throw new Error("INTERNAL_SERVICE_TOKEN_INVALID");
  }

  const keyConfig=input.keys.find(item=>item.kid===header.kid);
  if(!keyConfig)throw new Error("INTERNAL_SERVICE_TOKEN_KEY_UNKNOWN");

  const normalizedMethod=String(input.method||"").toUpperCase();
  const normalizedPath=normalizePath(input.path);
  const normalizedRequestId=String(input.requestId||"").trim();

  if(
    claims.iss!==input.serviceId||
    claims.sub!==input.serviceId||
    claims.aud!==TOKEN_AUD||
    claims.htm!==normalizedMethod||
    claims.htp!==normalizedPath||
    claims.rid!==normalizedRequestId
  ){
    throw new Error("INTERNAL_SERVICE_TOKEN_BINDING_INVALID");
  }
  if(!REQUEST_ID.test(normalizedRequestId)){
    throw new Error("INTERNAL_SERVICE_TOKEN_BINDING_INVALID");
  }
  if(
    !Number.isInteger(claims.iat)||
    !Number.isInteger(claims.exp)||
    typeof claims.jti!=="string"||
    !UUID.test(claims.jti)
  ){
    throw new Error("INTERNAL_SERVICE_TOKEN_CLAIMS_INVALID");
  }

  const now=input.nowSeconds??Math.floor(Date.now()/1000);
  if(
    claims.exp<=claims.iat||
    claims.exp-claims.iat>MAX_TTL_SECONDS||
    claims.iat>now+CLOCK_SKEW_SECONDS||
    claims.exp<now-CLOCK_SKEW_SECONDS
  ){
    throw new Error("INTERNAL_SERVICE_TOKEN_EXPIRED");
  }

  const key=publicKey(keyConfig.publicKeyPem);
  const signingInput=Buffer.from(parts[0]+"."+parts[1],"utf8");
  const signature=decodeBase64Url(parts[2]);

  if(!verifySignature(null,signingInput,key,signature)){
    throw new Error("INTERNAL_SERVICE_TOKEN_SIGNATURE_INVALID");
  }

  return {
    serviceId:input.serviceId,
    kid:header.kid,
    credentialFingerprint:createHash("sha256")
      .update(key.export({format:"der",type:"spki"}))
      .digest("hex")
      .slice(0,32),
    jti:claims.jti,
    issuedAt:claims.iat,
    expiresAt:claims.exp
  };
}

export function normalizeInternalServiceRequestPath(value:string){
  return normalizePath(value);
}

function publicKey(pem:string):KeyObject{
  let key:KeyObject;
  try{
    key=createPublicKey(pem);
  }catch{
    throw new Error("INTERNAL_SERVICE_TOKEN_KEY_INVALID");
  }
  if(key.asymmetricKeyType!=="ed25519"){
    throw new Error("INTERNAL_SERVICE_TOKEN_KEY_INVALID");
  }
  return key;
}

function parseJsonSegment(segment:string):Record<string,unknown>{
  try{
    const decoded=decodeBase64Url(segment).toString("utf8");
    const value=JSON.parse(decoded);
    if(!value||typeof value!=="object"||Array.isArray(value)){
      throw new Error("INVALID");
    }
    return value as Record<string,unknown>;
  }catch{
    throw new Error("INTERNAL_SERVICE_TOKEN_INVALID");
  }
}

function decodeBase64Url(value:string){
  if(!/^[A-Za-z0-9_-]+$/.test(value)){
    throw new Error("INTERNAL_SERVICE_TOKEN_INVALID");
  }
  try{
    return Buffer.from(value,"base64url");
  }catch{
    throw new Error("INTERNAL_SERVICE_TOKEN_INVALID");
  }
}

function normalizePath(value:string){
  const raw=String(value||"").trim();
  if(!raw.startsWith("/")||raw.length>240){
    throw new Error("INTERNAL_SERVICE_TOKEN_BINDING_INVALID");
  }
  const query=raw.indexOf("?");
  return query===-1?raw:raw.slice(0,query);
}
