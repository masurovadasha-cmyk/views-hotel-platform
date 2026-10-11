import {describe,expect,it} from "vitest";
import {dashboardEtag,matchesIfNoneMatch} from "./analytics-dashboard-http";

const FINGERPRINT="a".repeat(64);
const ETAG="\"views-dashboard-v1-"+FINGERPRINT+"\"";

describe("dashboard conditional HTTP",()=>{
  it("builds a stable quoted ETag from the source fingerprint",()=>{
    expect(dashboardEtag(FINGERPRINT)).toBe(ETAG);
  });

  it("matches strong, weak, list and wildcard If-None-Match values",()=>{
    expect(matchesIfNoneMatch(ETAG,ETAG)).toBe(true);
    expect(matchesIfNoneMatch("W/"+ETAG,ETAG)).toBe(true);
    expect(matchesIfNoneMatch("\"other\", "+ETAG,ETAG)).toBe(true);
    expect(matchesIfNoneMatch("*",ETAG)).toBe(true);
    expect(matchesIfNoneMatch("\"other\"",ETAG)).toBe(false);
  });

  it("rejects a malformed source fingerprint",()=>{
    expect(()=>dashboardEtag("not-a-fingerprint"))
      .toThrow("INVALID_DASHBOARD_SOURCE_FINGERPRINT");
  });
});
