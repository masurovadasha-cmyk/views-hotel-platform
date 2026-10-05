import {describe,expect,it} from "vitest";
import {clientNetworkKey,resolveClientAddress} from "./client-identity";
import {redactSecurityText,redactTelemetryValue} from "./redacting-logger";

describe("security telemetry redaction",()=>{
  it("redacts guest token-shaped values, email and phone from strings",()=>{
    const input="vge_fixturetoken123 user@example.test +998901234567";
    const output=redactSecurityText(input);

    expect(output).not.toContain("vge_fixturetoken123");
    expect(output).not.toContain("user@example.test");
    expect(output).not.toContain("+998901234567");
  });

  it("redacts sensitive object keys recursively",()=>{
    const output=redactTelemetryValue({
      authorization:"fixture-auth-value",
      "x-views-internal-key":"fixture-internal-key-value",
      "x-views-service-token":"fixture.signed.token",
      VIEWS_CORE_SIGNING_PRIVATE_KEY:"fixture-private-key",
      nested:{
        accessToken:"fixture-access-value",
        email:"user@example.test",
        safe:"ok"
      }
    }) as Record<string,any>;

    expect(output.authorization).toBe("[REDACTED]");
    expect(output["x-views-internal-key"]).toBe("[REDACTED]");
    expect(output["x-views-service-token"]).toBe("[REDACTED]");
    expect(output.VIEWS_CORE_SIGNING_PRIVATE_KEY).toBe("[REDACTED]");
    expect(output.nested.accessToken).toBe("[REDACTED]");
    expect(output.nested.email).toBe("[REDACTED]");
    expect(output.nested.safe).toBe("ok");
  });
});

describe("client network identity",()=>{
  it("uses direct socket address in direct mode and returns only HMAC form",()=>{
    expect(resolveClientAddress({remoteAddress:"::ffff:203.0.113.9"},"direct"))
      .toBe("203.0.113.9");
    const key=clientNetworkKey(
      {remoteAddress:"::ffff:203.0.113.9"},
      "direct",
      "fixture-rate-limit-key-material-32chars"
    );
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("203.0.113.9");
  });

  it("uses CF client address only in explicit cloudflare mode",()=>{
    const trusted=["10.0.0.0/8"];
    expect(resolveClientAddress(
      {remoteAddress:"10.0.0.5",cfConnectingIp:"198.51.100.7"},
      "cloudflare",
      trusted
    )).toBe("198.51.100.7");

    expect(()=>resolveClientAddress(
      {remoteAddress:"10.0.0.5",cfConnectingIp:null},
      "cloudflare",
      trusted
    )).toThrow("CLIENT_NETWORK_IDENTITY_UNAVAILABLE");
  });

  it("does not trust forwarded client identity from a direct origin peer",()=>{
    expect(()=>resolveClientAddress(
      {
        remoteAddress:"198.51.100.200",
        cfConnectingIp:"203.0.113.55"
      },
      "cloudflare",
      ["10.0.0.0/8"]
    )).toThrow("CLIENT_PROXY_NOT_TRUSTED");

    expect(()=>clientNetworkKey(
      {
        remoteAddress:"198.51.100.200",
        cfConnectingIp:"203.0.113.55"
      },
      "cloudflare",
      "fixture-rate-limit-key-material-32chars",
      ["10.0.0.0/8"]
    )).toThrow("CLIENT_PROXY_NOT_TRUSTED");
  });
});
