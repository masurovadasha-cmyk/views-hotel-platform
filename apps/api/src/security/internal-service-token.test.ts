import {generateKeyPairSync,randomUUID,sign} from "node:crypto";
import {describe,expect,it} from "vitest";
import {verifyInternalServiceToken} from "./internal-service-token";

const {publicKey,privateKey}=generateKeyPairSync("ed25519");
const OTHER=generateKeyPairSync("ed25519");
const PUBLIC=publicKey.export({format:"pem",type:"spki"}).toString();
const NOW=1_800_000_000;
const SERVICE="pages-bff";
const KID="pages-2026-10";
const REQUEST_ID="cf-stage7-token-fixture";
const PATH="/v1/analytics/dashboard/summary";

function token(overrides:Record<string,unknown>={},headerOverrides:Record<string,unknown>={}){
  const header={
    alg:"EdDSA",
    typ:"views-service+jwt",
    kid:KID,
    ...headerOverrides
  };
  const payload={
    iss:SERVICE,
    sub:SERVICE,
    aud:"views-core",
    iat:NOW,
    exp:NOW+30,
    jti:randomUUID(),
    htm:"GET",
    htp:PATH,
    rid:REQUEST_ID,
    ...overrides
  };
  const encodedHeader=Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input=encodedHeader+"."+encodedPayload;
  const signature=sign(null,Buffer.from(input),privateKey).toString("base64url");
  return input+"."+signature;
}

function verify(value:string){
  return verifyInternalServiceToken({
    token:value,
    serviceId:SERVICE,
    method:"GET",
    path:PATH+"?from=2036-01-01",
    requestId:REQUEST_ID,
    keys:[{kid:KID,publicKeyPem:PUBLIC}],
    nowSeconds:NOW
  });
}

describe("signed internal service token",()=>{
  it("accepts an Ed25519 token bound to service, audience and request",()=>{
    const result=verify(token());
    expect(result).toMatchObject({
      serviceId:SERVICE,
      kid:KID,
      issuedAt:NOW,
      expiresAt:NOW+30
    });
    expect(result.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.credentialFingerprint).toMatch(/^[a-f0-9]{32}$/);
  });

  it("rejects algorithm or explicit-type confusion",()=>{
    expect(()=>verify(token({}, {alg:"none"})))
      .toThrow("INTERNAL_SERVICE_TOKEN_INVALID");
    expect(()=>verify(token({}, {typ:"JWT"})))
      .toThrow("INTERNAL_SERVICE_TOKEN_INVALID");
  });

  it("rejects extra header or claim fields outside the service-token profile",()=>{
    expect(()=>verify(token({}, {jku:"https://attacker.invalid/jwks"})))
      .toThrow("INTERNAL_SERVICE_TOKEN_INVALID");
    expect(()=>verify(token({scope:"platform_admin"})))
      .toThrow("INTERNAL_SERVICE_TOKEN_CLAIMS_INVALID");
  });

  it("rejects service, audience and request binding mismatches",()=>{
    expect(()=>verify(token({iss:"analytics-cron",sub:"analytics-cron"})))
      .toThrow("INTERNAL_SERVICE_TOKEN_BINDING_INVALID");
    expect(()=>verify(token({aud:"other-core"})))
      .toThrow("INTERNAL_SERVICE_TOKEN_BINDING_INVALID");
    expect(()=>verify(token({htm:"POST"})))
      .toThrow("INTERNAL_SERVICE_TOKEN_BINDING_INVALID");
    expect(()=>verify(token({htp:"/v1/other"})))
      .toThrow("INTERNAL_SERVICE_TOKEN_BINDING_INVALID");
    expect(()=>verify(token({rid:"other-request"})))
      .toThrow("INTERNAL_SERVICE_TOKEN_BINDING_INVALID");
  });

  it("rejects expired, future or overlong tokens",()=>{
    expect(()=>verify(token({iat:NOW-120,exp:NOW-60})))
      .toThrow("INTERNAL_SERVICE_TOKEN_EXPIRED");
    expect(()=>verify(token({iat:NOW+10,exp:NOW+30})))
      .toThrow("INTERNAL_SERVICE_TOKEN_EXPIRED");
    expect(()=>verify(token({iat:NOW,exp:NOW+61})))
      .toThrow("INTERNAL_SERVICE_TOKEN_EXPIRED");
  });

  it("rejects unknown signing keys",()=>{
    const value=token({}, {kid:"unknown-key"});
    expect(()=>verifyInternalServiceToken({
      token:value,
      serviceId:SERVICE,
      method:"GET",
      path:PATH,
      requestId:REQUEST_ID,
      keys:[{kid:KID,publicKeyPem:PUBLIC}],
      nowSeconds:NOW
    })).toThrow("INTERNAL_SERVICE_TOKEN_KEY_UNKNOWN");
  });

  it("rejects tampered signatures and non-Ed25519 public keys",()=>{
    const value=token();
    const parts=value.split(".");
    const bad=parts[0]+"."+parts[1]+"."+sign(
      null,Buffer.from(parts[0]+"."+parts[1]),OTHER.privateKey
    ).toString("base64url");
    expect(()=>verify(bad)).toThrow("INTERNAL_SERVICE_TOKEN_SIGNATURE_INVALID");

    const rsa=generateKeyPairSync("rsa",{modulusLength:2048});
    expect(()=>verifyInternalServiceToken({
      token:value,
      serviceId:SERVICE,
      method:"GET",
      path:PATH,
      requestId:REQUEST_ID,
      keys:[{
        kid:KID,
        publicKeyPem:rsa.publicKey.export({format:"pem",type:"spki"}).toString()
      }],
      nowSeconds:NOW
    })).toThrow("INTERNAL_SERVICE_TOKEN_KEY_INVALID");
  });

  it("rejects malformed claims and malformed compact serialization",()=>{
    expect(()=>verify(token({jti:"not-a-uuid"})))
      .toThrow("INTERNAL_SERVICE_TOKEN_CLAIMS_INVALID");
    expect(()=>verify("not.a.valid.jwt"))
      .toThrow("INTERNAL_SERVICE_TOKEN_INVALID");
  });
});
