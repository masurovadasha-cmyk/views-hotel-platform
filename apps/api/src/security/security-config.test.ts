import {describe,expect,it} from "vitest";
import {loadConfig} from "../config";

describe("guest auth security config",()=>{
  it("requires a rate-limit HMAC secret in production",()=>{
    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare"
    })).toThrow("GUEST_AUTH_RATE_LIMIT_SECRET is required in production");
  });

  it("rejects short production HMAC secrets",()=>{
    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:"too-short"
    })).toThrow("GUEST_AUTH_RATE_LIMIT_SECRET must be at least 32 characters");
  });

  it("accepts explicit Cloudflare production configuration",()=>{
    const config=loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:"fixture-production-rate-limit-key-material"
    });
    expect(config.trustedProxyMode).toBe("cloudflare");
    expect(config.guestAuthRateLimitSecret.length).toBeGreaterThanOrEqual(32);
  });
});
