import {describe,expect,it} from "vitest";
import {loadConfig} from "../config";

const GUEST_SECRET="fixture-production-rate-limit-key-material";
const CURRENT="fixture-current-internal-api-key-material";
const PREVIOUS="fixture-previous-internal-api-key-material";

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

  it("requires a current internal API key in production",()=>{
    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:GUEST_SECRET
    })).toThrow("VIEWS_INTERNAL_API_KEY is required in production");
  });

  it("rejects short current and previous internal API keys",()=>{
    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:GUEST_SECRET,
      VIEWS_INTERNAL_API_KEY:"too-short"
    })).toThrow("VIEWS_INTERNAL_API_KEY must be at least 32 characters");

    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:GUEST_SECRET,
      VIEWS_INTERNAL_API_KEY:CURRENT,
      VIEWS_INTERNAL_API_KEY_PREVIOUS:"too-short"
    })).toThrow("VIEWS_INTERNAL_API_KEY_PREVIOUS must be at least 32 characters");
  });

  it("accepts a current and previous key during rotation",()=>{
    const config=loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:GUEST_SECRET,
      VIEWS_INTERNAL_API_KEY:CURRENT,
      VIEWS_INTERNAL_API_KEY_PREVIOUS:PREVIOUS
    });
    expect(config.internalApiKey).toBe(CURRENT);
    expect(config.internalApiKeys).toEqual([CURRENT,PREVIOUS]);
  });

  it("deduplicates an identical previous key",()=>{
    const config=loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:GUEST_SECRET,
      VIEWS_INTERNAL_API_KEY:CURRENT,
      VIEWS_INTERNAL_API_KEY_PREVIOUS:CURRENT
    });
    expect(config.internalApiKeys).toEqual([CURRENT]);
  });

  it("accepts explicit single-key production security configuration",()=>{
    const config=loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"production",
      TRUSTED_PROXY_MODE:"cloudflare",
      GUEST_AUTH_RATE_LIMIT_SECRET:GUEST_SECRET,
      VIEWS_INTERNAL_API_KEY:CURRENT
    });
    expect(config.trustedProxyMode).toBe("cloudflare");
    expect(config.guestAuthRateLimitSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.internalApiKey).toBe(CURRENT);
    expect(config.internalApiKeys).toEqual([CURRENT]);
  });
});
