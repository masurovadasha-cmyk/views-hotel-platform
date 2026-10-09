import {createRemoteJWKSet,jwtVerify} from "jose";

/**
 * Validates an OIDC access token. Tenant/role claims are accepted only from
 * an explicitly configured issuer and audience, never from request parameters.
 * Provider must issue access tokens with these app-specific claims.
 */
export function createOidcVerifier({issuer,audience,jwksUrl,organizationClaim="organization_id",rolesClaim="views_roles"}){
 if(!issuer||!audience||!jwksUrl)throw Error("OIDC issuer, audience and JWKS URL required");
 const issuerUrl=new URL(issuer);
 const keyUrl=new URL(jwksUrl);
 if(issuerUrl.protocol!=="https:"||keyUrl.protocol!=="https:"||issuerUrl.username||keyUrl.username||issuerUrl.password||keyUrl.password)throw Error("OIDC configuration requires HTTPS");
 if(!/^[-a-zA-Z0-9_]{1,64}$/.test(organizationClaim)||!/^[-a-zA-Z0-9_]{1,64}$/.test(rolesClaim))throw Error("Invalid OIDC claim names");
 const jwks=createRemoteJWKSet(keyUrl,{timeoutDuration:5000,cooldownDuration:30000});
 const rolesAllowed=new Set(["guest","staff","dispatcher","admin","finance"]);
 return async token=>{
  const {payload}=await jwtVerify(token,jwks,{issuer,audience,algorithms:["RS256","ES256"],clockTolerance:5,requiredClaims:["exp","iat","sub"]});
  const org=payload[organizationClaim],roles=payload[rolesClaim];
  if(typeof payload.sub!=="string"||payload.sub.length<1||payload.sub.length>256)throw Error("Unauthorized");
  if(typeof org!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(org))throw Error("Unauthorized");
  if(!Array.isArray(roles)||roles.length<1||roles.length>10||roles.some(role=>typeof role!=="string"||!rolesAllowed.has(role)))throw Error("Unauthorized");
  return {sub:payload.sub,organizationId:org,roles:[...new Set(roles)]};
 };
}
