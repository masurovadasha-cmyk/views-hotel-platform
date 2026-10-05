import {describe,expect,it} from "vitest";
import {trustedInternalServiceIdentity} from "./internal-service-identity";

const CURRENT="fixture-current-internal-api-key-material";
const PREVIOUS="fixture-previous-internal-api-key-material";
const PAGES_CURRENT="fixture-pages-bff-current-key-material";
const PAGES_PREVIOUS="fixture-pages-bff-previous-key-material";
const CRON_CURRENT="fixture-analytics-cron-current-key-material";
const SERVICE_AUTH={
  legacyKeys:[CURRENT,PREVIOUS],
  serviceKeys:{
    "pages-bff":[PAGES_CURRENT,PAGES_PREVIOUS],
    "analytics-cron":[CRON_CURRENT]
  }
};

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
});
