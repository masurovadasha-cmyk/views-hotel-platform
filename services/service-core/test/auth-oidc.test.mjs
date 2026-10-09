import test from "node:test";
import assert from "node:assert/strict";
import {createOidcVerifier} from "../src/auth-oidc.mjs";
const valid={issuer:"https://identity.example.org/",audience:"views-service-api",jwksUrl:"https://identity.example.org/.well-known/jwks.json"};
test("OIDC verifier rejects missing issuer, audience or JWKS",()=>{
 for(const key of Object.keys(valid))assert.throws(()=>createOidcVerifier({...valid,[key]:""}),/required/);
});
test("OIDC verifier rejects insecure or credential-bearing endpoints",()=>{
 assert.throws(()=>createOidcVerifier({...valid,issuer:"http://identity.example.org/"}),/HTTPS/);
 assert.throws(()=>createOidcVerifier({...valid,jwksUrl:"http://identity.example.org/keys"}),/HTTPS/);
 assert.throws(()=>createOidcVerifier({...valid,jwksUrl:"https://user:pass@identity.example.org/keys"}),/HTTPS/);
});
test("OIDC verifier rejects invalid tenant and role claim names",()=>{
 assert.throws(()=>createOidcVerifier({...valid,organizationClaim:"__proto__.org"}),/Invalid OIDC claim/);
 assert.throws(()=>createOidcVerifier({...valid,rolesClaim:"role claim"}),/Invalid OIDC claim/);
});
test("OIDC verifier initializes only with pinned issuer and audience",()=>{
 const verify=createOidcVerifier(valid);
 assert.equal(typeof verify,"function");
});
