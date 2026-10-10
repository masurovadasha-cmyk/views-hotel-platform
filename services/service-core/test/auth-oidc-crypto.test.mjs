import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from "jose";
import {verifyOidcAccessToken} from "../src/auth-oidc.mjs";

const issuer="https://identity.example.org/";
const audience="views-service-api";
const organization_id="11111111-1111-4111-8111-111111111111";
test("signed OIDC access tokens require correct key, issuer, audience, expiry and roles",async()=>{
 const {publicKey,privateKey}=await generateKeyPair("RS256");
 const publicJwk=await exportJWK(publicKey);
 publicJwk.kid="views-test-key";
 publicJwk.alg="RS256";
 publicJwk.use="sig";
 const keys=createLocalJWKSet({keys:[publicJwk]});
 const makeToken=({iss=issuer,aud=audience,exp=300,roles=["staff"]}={})=>
  new SignJWT({organization_id,views_roles:roles}).setProtectedHeader({alg:"RS256",kid:"views-test-key"})
   .setIssuer(iss).setAudience(aud).setSubject("staff-123")
   .setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)+exp).sign(privateKey);
 const token=await makeToken();
 assert.deepEqual(await verifyOidcAccessToken(token,keys,{issuer,audience}),{sub:"staff-123",organizationId:organization_id,roles:["staff"]});
 await assert.rejects(verifyOidcAccessToken(token,keys,{issuer:"https://different.example.org/",audience}),/issuer|iss/i);
 await assert.rejects(verifyOidcAccessToken(token,keys,{issuer,audience:"other-service"}),/audience|aud/i);
 await assert.rejects(verifyOidcAccessToken(await makeToken({exp:-60}),keys,{issuer,audience}),/expired/i);
 await assert.rejects(verifyOidcAccessToken(await makeToken({roles:["owner"]}),keys,{issuer,audience}),/Unauthorized/);
 const {privateKey:foreignKey}=await generateKeyPair("RS256");
 const forged=await new SignJWT({organization_id,views_roles:["admin"]}).setProtectedHeader({alg:"RS256",kid:"views-test-key"}).setIssuer(issuer).setAudience(audience).setSubject("attacker").setIssuedAt().setExpirationTime("5m").sign(foreignKey);
 await assert.rejects(verifyOidcAccessToken(forged,keys,{issuer,audience}));
});
