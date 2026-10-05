import {describe,expect,it} from "vitest";
import {loadConfig} from "../config";

const GUEST_SECRET="fixture-production-rate-limit-key-material";
const CURRENT="fixture-current-internal-api-key-material";
const PREVIOUS="fixture-previous-internal-api-key-material";
const PAGES_CURRENT="fixture-pages-bff-current-key-material";
const PAGES_PREVIOUS="fixture-pages-bff-previous-key-material";
const CRON_CURRENT="fixture-analytics-cron-current-key-material";

const SERVICE_KEYS=JSON.stringify({
  "pages-bff":[PAGES_CURRENT,PAGES_PREVIOUS],
  "analytics-cron":[CRON_CURRENT]
});

function base(){
  return {
    DATABASE_URL:"postgresql://example.invalid/views",
    NODE_ENV:"production",
    TRUSTED_PROXY_MODE:"cloudflare",
    GUEST_AUTH_RATE_LIMIT_SECRET:GUEST_SECRET
  } as NodeJS.ProcessEnv;
}

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

  it("requires service-specific key rings in production",()=>{
    expect(()=>loadConfig(base()))
      .toThrow("VIEWS_INTERNAL_SERVICE_KEYS_JSON is required in production");
  });

  it("accepts production service rings without a legacy global key",()=>{
    const config=loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:SERVICE_KEYS
    });
    expect(config.internalServiceKeys).toEqual({
      "pages-bff":[PAGES_CURRENT,PAGES_PREVIOUS],
      "analytics-cron":[CRON_CURRENT]
    });
  });

  it("still validates optional legacy current and previous keys when supplied",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_API_KEY:"too-short",
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:SERVICE_KEYS
    })).toThrow("VIEWS_INTERNAL_API_KEY must be at least 32 characters");

    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_API_KEY:CURRENT,
      VIEWS_INTERNAL_API_KEY_PREVIOUS:"too-short",
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:SERVICE_KEYS
    })).toThrow("VIEWS_INTERNAL_API_KEY_PREVIOUS must be at least 32 characters");
  });

  it("keeps the legacy current/previous ring available for non-service-bound environments",()=>{
    const config=loadConfig({
      ...base(),
      VIEWS_INTERNAL_API_KEY:CURRENT,
      VIEWS_INTERNAL_API_KEY_PREVIOUS:PREVIOUS,
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:SERVICE_KEYS
    });
    expect(config.internalApiKey).toBe(CURRENT);
    expect(config.internalApiKeys).toEqual([CURRENT,PREVIOUS]);
  });

  it("rejects malformed or weak service-key configuration",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:"not-json"
    })).toThrow("VIEWS_INTERNAL_SERVICE_KEYS_JSON must be valid JSON");

    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({
        "Bad Service":[PAGES_CURRENT]
      })
    })).toThrow("VIEWS_INTERNAL_SERVICE_KEYS_JSON contains invalid service id");

    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({
        "pages-bff":["too-short"]
      })
    })).toThrow("VIEWS_INTERNAL_SERVICE_KEYS_JSON keys must be at least 32 characters");
  });

  it("rejects one key being shared across two service identities",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({
        "pages-bff":[PAGES_CURRENT],
        "analytics-cron":[PAGES_CURRENT]
      })
    })).toThrow(
      "VIEWS_INTERNAL_SERVICE_KEYS_JSON key cannot be shared across services"
    );
  });

  it("deduplicates a repeated key inside one service rotation ring",()=>{
    const config=loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({
        "pages-bff":[PAGES_CURRENT,PAGES_CURRENT]
      })
    });
    expect(config.internalServiceKeys["pages-bff"]).toEqual([PAGES_CURRENT]);
  });
});
