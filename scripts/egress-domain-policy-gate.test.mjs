import {describe,expect,it} from "vitest";
import {
  EgressDomainPolicyError,
  parseEgressDomainPolicy
} from "./egress-domain-policy-gate.mjs";

describe("egress domain policy",()=>{
  it("normalizes exact and suffix DNS entries",()=>{
    expect(parseEgressDomainPolicy(`
# comment
api.example.com
.example.org
API.EXAMPLE.COM
`)).toEqual([".example.org","api.example.com"]);
  });

  it("rejects URLs, ports, wildcards and IP literals",()=>{
    for(const value of [
      "https://example.com",
      "example.com:443",
      "*.example.com",
      "1.1.1.1",
      "[::1]"
    ]){
      expect(()=>parseEgressDomainPolicy(value))
        .toThrow(EgressDomainPolicyError);
    }
  });

  it("rejects local and metadata-style names",()=>{
    for(const value of [
      "localhost",
      "service.local",
      "service.internal",
      "metadata.google.internal",
      "169.254.169.254"
    ]){
      expect(()=>parseEgressDomainPolicy(value))
        .toThrow(EgressDomainPolicyError);
    }
  });

  it("rejects empty policy",()=>{
    expect(()=>parseEgressDomainPolicy("# only comments"))
      .toThrow("EGRESS_DOMAIN_POLICY_EMPTY");
  });
});
