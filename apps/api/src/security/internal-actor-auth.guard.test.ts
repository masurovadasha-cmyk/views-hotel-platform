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
