import {generateKeyPairSync,randomUUID,sign} from "node:crypto";
import {describe,expect,it} from "vitest";
import {trustedInternalServiceIdentity} from "./internal-service-identity";

const CURRENT="fixture-current-internal-api-key-material";
const PREVIOUS="fixture-previous-internal-api-key-material";
const PAGES_CURRENT="fixture-pages-bff-current-key-material";
const PAGES_PREVIOUS="fixture-pages-bff-previous-key-material";
const CRON_CURRENT="fixture-analytics-cron-current-key-material";
const SIGNING=generateKeyPairSync("ed25519");
const SIGNING_PUBLIC=SIGNING.publicKey.export({format:"pem",type:"spki"}).toString();
const NOW=1_800_000_000;
const REQUEST={
  method:"GET",
  path:"/v1/analytics/dashboard/summary",
  requestId:"stage7-service-identity-request",
  nowSeconds:NOW
};
const SERVICE_AUTH={
  legacyKeys:[CURRENT,PREVIOUS],
  serviceKeys:{
    "pages-bff":[PAGES_CURRENT,PAGES_PREVIOUS],
    "analytics-cron":[CRON_CURRENT]
  },
  servicePublicKeys:{
    "pages-bff":[{kid:"pages-2026-10",publicKeyPem:SIGNING_PUBLIC}]
  }
};

function signedToken(overrides:Record<string,unknown>={}){
  const header={
    alg:"EdDSA",
    typ:"views-service+jwt",
    kid:"pages-2026-10"
  };
  const payload={
    iss:"pages-bff",
    sub:"pages-bff",
    aud:"views-core",
    iat:NOW,
    exp:NOW+30,
    jti:randomUUID(),
    htm:"GET",
    htp:"/v1/analytics/dashboard/summary",
    rid:"stage7-service-identity-request",
    ...overrides
  };
  const h=Buffer.from(JSON.stringify(header)).toString("base64url");
  const p=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input=h+"."+p;
  return input+"."+sign(null,Buffer.from(input),SIGNING.privateKey).toString("base64url");
}

describe("trusted internal service identity",()=>{
  it("accepts current and previous rotation keys and fingerprints the presented key",()=>{
    const current=trustedInternalServiceIdentity({
      "x-views-internal-key":CURRENT,
      "x-views-service-id":"pages-bff"
    },[CURRENT,PREVIOUS]);

    const previous=trustedInternalServiceIdentity({
      "x-views-internal-key":PREVIOUS,
      "x-views-service-id":"analytics-cron"
    },[CURRENT,PREVIOUS]);

    expect(current).toMatchObject({serviceId:"pages-bff"});
    expect(previous).toMatchObject({serviceId:"analytics-cron"});
    expect(current?.keyFingerprint).toMatch(/^[a-f0-9]{32}$/);
    expect(previous?.keyFingerprint).toMatch(/^[a-f0-9]{32}$/);
    expect(current?.keyFingerprint).not.toBe(previous?.keyFingerprint);
  });

  it("binds each service identity to only its configured key ring",()=>{
    expect(trustedInternalServiceIdentity({
      "x-views-internal-key":PAGES_CURRENT,
      "x-views-service-id":"pages-bff"
    },SERVICE_AUTH)).toMatchObject({serviceId:"pages-bff"});

    expect(trustedInternalServiceIdentity({
      "x-views-internal-key":PAGES_PREVIOUS,
      "x-views-service-id":"pages-bff"
    },SERVICE_AUTH)).toMatchObject({serviceId:"pages-bff"});

    expect(()=>trustedInternalServiceIdentity({
      "x-views-internal-key":PAGES_CURRENT,
      "x-views-service-id":"analytics-cron"
    },SERVICE_AUTH)).toThrow("INTERNAL_API_UNAUTHORIZED");

    expect(()=>trustedInternalServiceIdentity({
      "x-views-internal-key":CRON_CURRENT,
      "x-views-service-id":"pages-bff"
    },SERVICE_AUTH)).toThrow("INTERNAL_API_UNAUTHORIZED");
  });

  it("rejects unknown service identities when service-specific mode is active",()=>{
    expect(()=>trustedInternalServiceIdentity({
      "x-views-internal-key":PAGES_CURRENT,
      "x-views-service-id":"unknown-service"
    },SERVICE_AUTH)).toThrow("INTERNAL_SERVICE_NOT_CONFIGURED");
  });

  it("does not fall back to the legacy shared key when service rings exist",()=>{
    expect(()=>trustedInternalServiceIdentity({
      "x-views-internal-key":CURRENT,
      "x-views-service-id":"pages-bff"
    },SERVICE_AUTH)).toThrow("INTERNAL_API_UNAUTHORIZED");
  });

  it("returns null when no internal key is present",()=>{
    expect(trustedInternalServiceIdentity({
      "x-views-service-id":"pages-bff"
    },[CURRENT,PREVIOUS])).toBeNull();
  });

  it("rejects a trusted key without a valid service identity",()=>{
    expect(()=>trustedInternalServiceIdentity({
      "x-views-internal-key":CURRENT
    },[CURRENT,PREVIOUS])).toThrow("INTERNAL_SERVICE_ID_REQUIRED");

    expect(()=>trustedInternalServiceIdentity({
      "x-views-internal-key":CURRENT,
      "x-views-service-id":"Bad Service"
    },[CURRENT,PREVIOUS])).toThrow("INTERNAL_SERVICE_ID_REQUIRED");
  });

  it("rejects a mismatched key before accepting a claimed service id",()=>{
    expect(()=>trustedInternalServiceIdentity({
      "x-views-internal-key":"different-internal-key-material-32chars",
      "x-views-service-id":"pages-bff"
    },[CURRENT,PREVIOUS])).toThrow("INTERNAL_API_UNAUTHORIZED");
  });

  it("accepts a request-bound signed token without a legacy internal key",()=>{
    const identity=trustedInternalServiceIdentity({
      "x-views-service-token":signedToken(),
      "x-views-service-id":"pages-bff"
    },SERVICE_AUTH,REQUEST);

    expect(identity).toMatchObject({
      serviceId:"pages-bff",
      authScheme:"signed_token"
    });
    expect(identity?.tokenJti).toMatch(/^[0-9a-f-]{36}$/);
    expect(identity?.keyFingerprint).toMatch(/^[a-f0-9]{32}$/);
  });

  it("rejects a symmetric key when the service is signed-only",()=>{
    const signedOnly={
      ...SERVICE_AUTH,
      serviceAuthModes:{"pages-bff":"signed_only" as const}
    };
    expect(()=>trustedInternalServiceIdentity({
      "x-views-internal-key":PAGES_CURRENT,
      "x-views-service-id":"pages-bff"
    },signedOnly,REQUEST)).toThrow("INTERNAL_SERVICE_SIGNED_TOKEN_REQUIRED");
  });

  it("rejects a signed token when the service is internal-key-only",()=>{
    const keyOnly={
      ...SERVICE_AUTH,
      serviceAuthModes:{"pages-bff":"internal_key_only" as const}
    };
    expect(()=>trustedInternalServiceIdentity({
      "x-views-service-token":signedToken(),
      "x-views-service-id":"pages-bff"
    },keyOnly,REQUEST)).toThrow("INTERNAL_SERVICE_TOKEN_NOT_ALLOWED");
  });

  it("accepts both credential paths in explicit dual mode",()=>{
    const dual={
      ...SERVICE_AUTH,
      serviceAuthModes:{"pages-bff":"dual" as const}
    };
    expect(trustedInternalServiceIdentity({
      "x-views-internal-key":PAGES_CURRENT,
      "x-views-service-id":"pages-bff"
    },dual,REQUEST)).toMatchObject({authScheme:"internal_key"});

    expect(trustedInternalServiceIdentity({
      "x-views-service-token":signedToken(),
      "x-views-service-id":"pages-bff"
    },dual,REQUEST)).toMatchObject({authScheme:"signed_token"});
  });

  it("does not downgrade to a valid API key when a token header is present but invalid",()=>{
    expect(()=>trustedInternalServiceIdentity({
      "x-views-service-token":signedToken({aud:"wrong-audience"}),
      "x-views-internal-key":PAGES_CURRENT,
      "x-views-service-id":"pages-bff"
    },SERVICE_AUTH,REQUEST)).toThrow("INTERNAL_SERVICE_TOKEN_BINDING_INVALID");
  });

});
