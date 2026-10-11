import {describe,expect,it} from "vitest";
import {
  InternalIngressFailure,
  assertInternalServiceIngress
} from "./internal-ingress.guard";
import {
  networkAddressAllowed,
  normalizeNetworkIp,
  validateNetworkRange
} from "./network-cidr";

describe("network CIDR boundary",()=>{
  it("matches IPv4, IPv6 and IPv4-mapped socket addresses",()=>{
    expect(networkAddressAllowed(
      "203.0.113.44",["203.0.113.0/24"]
    )).toBe(true);
    expect(networkAddressAllowed(
      "::ffff:203.0.113.44",["203.0.113.0/24"]
    )).toBe(true);
    expect(networkAddressAllowed(
      "2001:db8:7::10",["2001:db8:7::/48"]
    )).toBe(true);
    expect(networkAddressAllowed(
      "198.51.100.10",["203.0.113.0/24"]
    )).toBe(false);
    expect(normalizeNetworkIp("::ffff:203.0.113.9"))
      .toBe("203.0.113.9");
  });

  it("rejects malformed ranges and invalid prefix lengths",()=>{
    expect(()=>validateNetworkRange("not-a-cidr"))
      .toThrow("INVALID_NETWORK_CIDR");
    expect(()=>validateNetworkRange("203.0.113.0/33"))
      .toThrow("INVALID_NETWORK_CIDR");
    expect(()=>validateNetworkRange("2001:db8::/129"))
      .toThrow("INVALID_NETWORK_CIDR");
  });
});

describe("trusted service ingress boundary",()=>{
  it("requires a matching per-service source in direct mode",()=>{
    const config={
      trustedProxyMode:"direct" as const,
      trustedProxyCidrs:[],
      internalServiceSourceCidrs:{
        "pages-bff":["198.51.100.0/24"]
      }
    };

    expect(()=>assertInternalServiceIngress({
      serviceId:"pages-bff",
      remoteAddress:"198.51.100.25",
      cfConnectingIp:null,
      config
    })).not.toThrow();

    expect(()=>assertInternalServiceIngress({
      serviceId:"pages-bff",
      remoteAddress:"203.0.113.25",
      cfConnectingIp:null,
      config
    })).toThrow(InternalIngressFailure);

    expect(()=>assertInternalServiceIngress({
      serviceId:"analytics-cron",
      remoteAddress:"198.51.100.25",
      cfConnectingIp:null,
      config
    })).toThrow("trusted service ingress denied");
  });

  it("rejects a direct-origin bypass in cloudflare mode",()=>{
    const config={
      trustedProxyMode:"cloudflare" as const,
      trustedProxyCidrs:["203.0.113.0/24"],
      internalServiceSourceCidrs:{}
    };

    expect(()=>assertInternalServiceIngress({
      serviceId:"pages-bff",
      remoteAddress:"203.0.113.88",
      cfConnectingIp:"198.51.100.10",
      config
    })).not.toThrow();

    expect(()=>assertInternalServiceIngress({
      serviceId:"pages-bff",
      remoteAddress:"198.51.100.200",
      cfConnectingIp:"203.0.113.88",
      config
    })).toThrow("trusted service ingress denied");
  });

  it("accepts only the pinned cloudflared replicas in tunnel mode",()=>{
    const config={
      trustedProxyMode:"cloudflare_tunnel" as const,
      trustedProxyCidrs:["172.30.0.2/32","172.30.0.4/32"],
      internalServiceSourceCidrs:{}
    };

    expect(()=>assertInternalServiceIngress({
      serviceId:"pages-bff",
      remoteAddress:"172.30.0.2",
      cfConnectingIp:"198.51.100.50",
      config
    })).not.toThrow();

    expect(()=>assertInternalServiceIngress({
      serviceId:"pages-bff",
      remoteAddress:"172.30.0.4",
      cfConnectingIp:"198.51.100.51",
      config
    })).not.toThrow();

    expect(()=>assertInternalServiceIngress({
      serviceId:"pages-bff",
      remoteAddress:"172.30.0.5",
      cfConnectingIp:"198.51.100.50",
      config
    })).toThrow("trusted service ingress denied");
  });

  it("optionally restricts a service's client egress behind the proxy",()=>{
    const config={
      trustedProxyMode:"cloudflare" as const,
      trustedProxyCidrs:["203.0.113.0/24"],
      internalServiceSourceCidrs:{
        "analytics-cron":["198.51.100.0/24"]
      }
    };

    expect(()=>assertInternalServiceIngress({
      serviceId:"analytics-cron",
      remoteAddress:"203.0.113.10",
      cfConnectingIp:"198.51.100.50",
      config
    })).not.toThrow();

    expect(()=>assertInternalServiceIngress({
      serviceId:"analytics-cron",
      remoteAddress:"203.0.113.10",
      cfConnectingIp:"192.0.2.50",
      config
    })).toThrow("trusted service ingress denied");
  });
});
