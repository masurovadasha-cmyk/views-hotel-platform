import {describe,expect,it} from "vitest";
import {
  TrustedProxyCidrGateError,
  evaluateTrustedProxyCidrs,
  runTrustedProxyCidrGate
} from "./trusted-proxy-cidr-gate.mjs";

function provider(overrides={}){
  return {
    success:true,
    result:{
      etag:"fixture-etag",
      ipv4_cidrs:["173.245.48.0/20","103.21.244.0/22"],
      ipv6_cidrs:["2400:cb00::/32","2606:4700::/32"],
      ...overrides
    }
  };
}

describe("trusted proxy CIDR drift gate",()=>{
  it("is not applicable to the private cloudflared connector boundary",async()=>{
    let output="";
    const code=await runTrustedProxyCidrGate(
      [],
      {TRUSTED_PROXY_MODE:"cloudflare_tunnel"},
      {write:value=>{output+=String(value)}}
    );
    expect(code).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      ok:true,
      applicable:false,
      proxyMode:"cloudflare_tunnel",
      reason:"TUNNEL_CONNECTOR_BOUNDARY"
    });
  });

  it("passes only when configured and provider ranges match exactly",()=>{
    const result=evaluateTrustedProxyCidrs([
      "2606:4700::/32",
      "103.21.244.0/22",
      "2400:cb00::/32",
      "173.245.48.0/20"
    ],provider());

    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.providerEtag).toBe("fixture-etag");
    expect(result.configuredCount).toBe(4);
    expect(result.providerCount).toBe(4);
  });

  it("blocks a provider range that is missing from config",()=>{
    const result=evaluateTrustedProxyCidrs([
      "173.245.48.0/20",
      "103.21.244.0/22",
      "2400:cb00::/32"
    ],provider());

    expect(result.ok).toBe(false);
    expect(result.missingFromConfig).toEqual(["2606:4700::/32"]);
    expect(result.blockers).toContainEqual({
      code:"PROVIDER_RANGE_MISSING_FROM_CONFIG",
      cidr:"2606:4700::/32"
    });
  });

  it("blocks configured ranges no longer published by Cloudflare",()=>{
    const result=evaluateTrustedProxyCidrs([
      "173.245.48.0/20",
      "103.21.244.0/22",
      "2400:cb00::/32",
      "2606:4700::/32",
      "198.51.100.0/24"
    ],provider());

    expect(result.ok).toBe(false);
    expect(result.unexpectedInConfig).toEqual(["198.51.100.0/24"]);
    expect(result.blockers).toContainEqual({
      code:"CONFIG_RANGE_NOT_PUBLISHED_BY_PROVIDER",
      cidr:"198.51.100.0/24"
    });
  });

  it("fails closed on malformed provider payloads",()=>{
    expect(()=>evaluateTrustedProxyCidrs(
      ["173.245.48.0/20"],
      {success:true,result:{ipv4_cidrs:[],ipv6_cidrs:[]}}
    )).toThrow(TrustedProxyCidrGateError);

    expect(()=>evaluateTrustedProxyCidrs(
      ["173.245.48.0/20"],
      {success:false,result:{}}
    )).toThrow("INVALID_PROVIDER_RESPONSE");
  });

  it("rejects duplicate or malformed configured ranges",()=>{
    expect(()=>evaluateTrustedProxyCidrs([
      "173.245.48.0/20",
      "173.245.48.0/20"
    ],provider())).toThrow("INVALID_CONFIGURED_CIDRS");

    expect(()=>evaluateTrustedProxyCidrs([
      "0.0.0.0/33"
    ],provider())).toThrow("INVALID_CONFIGURED_CIDRS");
  });

  it("validates address family placement in provider data",()=>{
    expect(()=>evaluateTrustedProxyCidrs([
      "173.245.48.0/20"
    ],provider({
      ipv4_cidrs:["2400:cb00::/32"],
      ipv6_cidrs:["2606:4700::/32"]
    }))).toThrow("INVALID_PROVIDER_RESPONSE");
  });
});
