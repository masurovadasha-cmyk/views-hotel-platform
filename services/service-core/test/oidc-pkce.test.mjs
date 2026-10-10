import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createPkcePair,validateOidcBrowserConfig} from "../src/oidc-pkce.mjs";
test("PKCE uses unique high entropy S256 challenges",()=>{
 const a=createPkcePair(),b=createPkcePair();
 assert.notEqual(a.verifier,b.verifier);
 assert.equal(a.method,"S256");
 assert.equal(createHash("sha256").update(a.verifier).digest("base64url"),a.challenge);
 assert.ok(a.verifier.length>=43);
});
test("OIDC browser config requires HTTPS, except localhost callback",()=>{
 assert.throws(()=>validateOidcBrowserConfig({issuer:"http://unsafe.example",clientId:"v",redirectUri:"https://app.example/callback"}),/Issuer/);
 assert.throws(()=>validateOidcBrowserConfig({issuer:"https://id.example",clientId:"v",redirectUri:"http://app.example/callback"}),/Redirect/);
 assert.equal(validateOidcBrowserConfig({issuer:"https://id.example",clientId:"v",redirectUri:"http://localhost:3000/callback"}).clientId,"v");
});
