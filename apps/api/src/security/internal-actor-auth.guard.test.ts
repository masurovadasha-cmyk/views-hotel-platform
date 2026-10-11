import {generateKeyPairSync,randomUUID,sign} from "node:crypto";
import {UnauthorizedException} from "@nestjs/common";
import {describe,expect,it} from "vitest";
import {assertTrustedInternalActorHeaders} from "./internal-actor-auth.guard";

const KEY="fixture-current-internal-api-key-material";
const PREVIOUS="fixture-previous-internal-api-key-material";
const ACTOR={
  "x-organization-id":"00000000-0000-4000-8000-000000000001",
  "x-user-id":"20000000-0000-4000-8000-000000000001",
  "x-membership-id":"30000000-0000-4000-8000-000000000001"
};
const SERVICE={"x-views-service-id":"pages-bff"};
const SIGNING=generateKeyPairSync("ed25519");
const SIGNING_PUBLIC=SIGNING.publicKey.export({format:"pem",type:"spki"}).toString();
const NOW=1_800_000_000;
const REQUEST={
  method:"GET",
  path:"/v1/analytics/dashboard/summary",
  requestId:"stage7-guard-signed-request",
  nowSeconds:NOW
};
const SIGNED_AUTH={
  legacyKeys:[KEY,PREVIOUS],
  serviceKeys:{"pages-bff":[KEY]},
  servicePublicKeys:{
    "pages-bff":[{kid:"pages-2026-10",publicKeyPem:SIGNING_PUBLIC}]
  }
};

function signedToken(overrides:Record<string,unknown>={}){
  const header={alg:"EdDSA",typ:"views-service+jwt",kid:"pages-2026-10"};
  const claims={
    iss:"pages-bff",sub:"pages-bff",aud:"views-core",
    iat:NOW,exp:NOW+30,jti:randomUUID(),
    htm:"GET",htp:"/v1/analytics/dashboard/summary",
    rid:"stage7-guard-signed-request",...overrides
  };
  const h=Buffer.from(JSON.stringify(header)).toString("base64url");
  const p=Buffer.from(JSON.stringify(claims)).toString("base64url");
  const input=h+"."+p;
  return input+"."+sign(null,Buffer.from(input),SIGNING.privateKey).toString("base64url");
}

describe("internal actor gateway boundary",()=>{
  it("allows public routes that send no actor context",()=>{
    expect(()=>assertTrustedInternalActorHeaders({},[KEY,PREVIOUS])).not.toThrow();
    expect(()=>assertTrustedInternalActorHeaders(
      {"x-views-internal-key":KEY},
      [KEY,PREVIOUS]
    )).not.toThrow();
  });

  it("requires the full actor triplet once any actor header is present",()=>{
    expect(()=>assertTrustedInternalActorHeaders({
      "x-organization-id":ACTOR["x-organization-id"],
      "x-views-internal-key":KEY
    },[KEY,PREVIOUS])).toThrowError(UnauthorizedException);
  });

  it("rejects actor context without the internal key",()=>{
    expect(()=>assertTrustedInternalActorHeaders(ACTOR,[KEY,PREVIOUS]))
      .toThrow("internal API authentication required");
  });

  it("rejects a mismatched internal key",()=>{
    expect(()=>assertTrustedInternalActorHeaders({
      ...ACTOR,
      ...SERVICE,
      "x-views-internal-key":"different-internal-key-material-32chars"
    },[KEY,PREVIOUS])).toThrow("internal API authentication required");
  });

  it("accepts a complete actor context only with the internal key",()=>{
    expect(()=>assertTrustedInternalActorHeaders({
      ...ACTOR,
      ...SERVICE,
      "x-views-internal-key":KEY
    },[KEY,PREVIOUS])).not.toThrow();
  });

  it("accepts the previous key while the rotation window is active",()=>{
    expect(()=>assertTrustedInternalActorHeaders({
      ...ACTOR,
      ...SERVICE,
      "x-views-internal-key":PREVIOUS
    },[KEY,PREVIOUS])).not.toThrow();
  });

  it("accepts a request-bound signed token for a complete actor context",()=>{
    expect(()=>assertTrustedInternalActorHeaders({
      ...ACTOR,
      ...SERVICE,
      "x-views-service-token":signedToken(),
      "x-request-id":REQUEST.requestId
    },SIGNED_AUTH,REQUEST)).not.toThrow();
  });

  it("classifies a legacy key attempt on a signed-only service",()=>{
    const signedOnly={
      ...SIGNED_AUTH,
      serviceAuthModes:{"pages-bff":"signed_only" as const}
    };
    try{
      assertTrustedInternalActorHeaders({
        ...ACTOR,
        ...SERVICE,
        "x-views-internal-key":KEY,
        "x-request-id":REQUEST.requestId
      },signedOnly,REQUEST);
      throw new Error("EXPECTED_SIGNED_ONLY_REJECTION");
    }catch(error){
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as {reason?:string}).reason).toBe("signed_token_required");
    }
  });

  it("does not downgrade a bad signed token to a valid internal key",()=>{
    expect(()=>assertTrustedInternalActorHeaders({
      ...ACTOR,
      ...SERVICE,
      "x-views-service-token":signedToken({aud:"wrong-core"}),
      "x-views-internal-key":KEY,
      "x-request-id":REQUEST.requestId
    },SIGNED_AUTH,REQUEST)).toThrow("internal API authentication required");
  });

  it("rejects a valid key when trusted service identity is missing",()=>{
    expect(()=>assertTrustedInternalActorHeaders({
      ...ACTOR,
      "x-views-internal-key":KEY
    },[KEY,PREVIOUS])).toThrow("trusted internal service identity required");
  });

  it("rejects an invalid trusted service identity",()=>{
    expect(()=>assertTrustedInternalActorHeaders({
      ...ACTOR,
      "x-views-internal-key":KEY,
      "x-views-service-id":"Bad Service"
    },[KEY,PREVIOUS])).toThrow("trusted internal service identity required");
  });

  it("rejects duplicated security headers instead of picking one",()=>{
    expect(()=>assertTrustedInternalActorHeaders({
      ...ACTOR,
      "x-views-internal-key":[KEY,"different-internal-key-material-32chars"]
    },[KEY,PREVIOUS])).toThrow("internal API authentication required");
  });
});
