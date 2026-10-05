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
      nested:{
        accessToken:"fixture-access-value",
        email:"user@example.test",
        safe:"ok"
      }
    }) as Record<string,any>;

    expect(output.authorization).toBe("[REDACTED]");
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
    expect(resolveClientAddress(
      {remoteAddress:"10.0.0.5",cfConnectingIp:"198.51.100.7"},
      "cloudflare"
    )).toBe("198.51.100.7");

    expect(()=>resolveClientAddress(
      {remoteAddress:"10.0.0.5",cfConnectingIp:null},
      "cloudflare"
    )).toThrow("CLIENT_NETWORK_IDENTITY_UNAVAILABLE");
  });
});
