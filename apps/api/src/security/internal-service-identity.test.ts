import {describe,expect,it} from "vitest";
import {trustedInternalServiceIdentity} from "./internal-service-identity";

const CURRENT="fixture-current-internal-api-key-material";
const PREVIOUS="fixture-previous-internal-api-key-material";

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
