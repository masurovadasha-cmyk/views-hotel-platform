import {describe,expect,it} from "vitest";
import {loadConfig} from "../config";

describe("production security config",()=>{
  it("requires a rate-limit HMAC secret in production",()=>{
    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare"
    })).toThrow("GUEST_AUTH_RATE_LIMIT_SECRET is required in production");
  });

  it("rejects short guest-auth HMAC secrets",()=>{
    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:"too-short"
    })).toThrow("GUEST_AUTH_RATE_LIMIT_SECRET must be at least 32 characters");
  });

  it("requires an internal API key in production",()=>{
    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:"fixture-production-rate-limit-key-material"
    })).toThrow("VIEWS_INTERNAL_API_KEY is required in production");
  });

  it("rejects short internal API keys",()=>{
    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:"fixture-production-rate-limit-key-material",
      VIEWS_INTERNAL_API_KEY:"too-short"
    })).toThrow("VIEWS_INTERNAL_API_KEY must be at least 32 characters");
  });

  it("accepts explicit production security configuration",()=>{
    const config=loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:"fixture-production-rate-limit-key-material",
      VIEWS_INTERNAL_API_KEY:"fixture-internal-api-key-material-32chars"
    });
    expect(config.trustedProxyMode).toBe("cloudflare");
    expect(config.guestAuthRateLimitSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.internalApiKey.length).toBeGreaterThanOrEqual(32);
  });
});
