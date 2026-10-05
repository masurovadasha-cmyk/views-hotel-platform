import {describe,expect,it} from "vitest";
import {loadConfig} from "../config";

const GUEST_SECRET="fixture-production-rate-limit-key-material";
const CURRENT="fixture-current-internal-api-key-material";
const PREVIOUS="fixture-previous-internal-api-key-material";
const PAGES_CURRENT="fixture-pages-bff-current-key-material";
const PAGES_PREVIOUS="fixture-pages-bff-previous-key-material";
const CRON_CURRENT="fixture-analytics-cron-current-key-material";

const SERVICE_REFS=JSON.stringify({
  "pages-bff":["VIEWS_SECRET_PAGES_CURRENT","VIEWS_SECRET_PAGES_PREVIOUS"],
  "analytics-cron":["VIEWS_SECRET_CRON_CURRENT"]
});

const RAW_SERVICE_KEYS=JSON.stringify({
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

function managed(){
  return {
    ...base(),
    VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:SERVICE_REFS,
    VIEWS_SECRET_PAGES_CURRENT:PAGES_CURRENT,
    VIEWS_SECRET_PAGES_PREVIOUS:PAGES_PREVIOUS,
    VIEWS_SECRET_CRON_CURRENT:CRON_CURRENT
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

  it("requires managed service-key references in production",()=>{
    expect(()=>loadConfig(base()))
      .toThrow("VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON is required in production");
  });

  it("resolves production service rings from individually injected secrets",()=>{
    const config=loadConfig(managed());
    expect(config.internalServiceKeys).toEqual({
      "pages-bff":[PAGES_CURRENT,PAGES_PREVIOUS],
      "analytics-cron":[CRON_CURRENT]
    });
  });

  it("rejects raw service-key JSON as a production replacement for secret references",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:RAW_SERVICE_KEYS
    })).toThrow("VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON is required in production");
  });

  it("rejects ambiguous raw and reference configuration",()=>{
    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:RAW_SERVICE_KEYS
    })).toThrow(
      "Configure either VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON or VIEWS_INTERNAL_SERVICE_KEYS_JSON, not both"
    );
  });

  it("still validates optional legacy current and previous keys when supplied",()=>{
    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_API_KEY:"too-short"
    })).toThrow("VIEWS_INTERNAL_API_KEY must be at least 32 characters");

    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_API_KEY:CURRENT,
      VIEWS_INTERNAL_API_KEY_PREVIOUS:"too-short"
    })).toThrow("VIEWS_INTERNAL_API_KEY_PREVIOUS must be at least 32 characters");
  });

  it("keeps the legacy current/previous ring available in non-production migration environments",()=>{
    const config=loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"test",
      VIEWS_INTERNAL_API_KEY:CURRENT,
      VIEWS_INTERNAL_API_KEY_PREVIOUS:PREVIOUS
    });
    expect(config.internalApiKey).toBe(CURRENT);
    expect(config.internalApiKeys).toEqual([CURRENT,PREVIOUS]);
    expect(config.internalServiceKeys).toEqual({});
  });

  it("keeps raw service rings as a non-production migration fallback",()=>{
    const config=loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"test",
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:RAW_SERVICE_KEYS
    });
    expect(config.internalServiceKeys["pages-bff"]).toEqual([
      PAGES_CURRENT,PAGES_PREVIOUS
    ]);
  });

  it("rejects malformed managed reference configuration",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:"not-json"
    })).toThrow("VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON must be valid JSON");

    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:JSON.stringify({
        "Bad Service":["VIEWS_SECRET_PAGES_CURRENT"]
      }),
      VIEWS_SECRET_PAGES_CURRENT:PAGES_CURRENT
    })).toThrow("VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON contains invalid service id");

    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":["bad-ref"]
      })
    })).toThrow(
      "VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON references must be environment variable names"
    );
  });

  it("fails closed when a referenced secret is missing or weak",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":["VIEWS_SECRET_PAGES_CURRENT"]
      })
    })).toThrow("Referenced internal service key VIEWS_SECRET_PAGES_CURRENT is required");

    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":["VIEWS_SECRET_PAGES_CURRENT"]
      }),
      VIEWS_SECRET_PAGES_CURRENT:"too-short"
    })).toThrow(
      "Referenced internal service key VIEWS_SECRET_PAGES_CURRENT must be at least 32 characters"
    );
  });

  it("rejects one secret reference being assigned to two service identities",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":["VIEWS_SECRET_SHARED"],
        "analytics-cron":["VIEWS_SECRET_SHARED"]
      }),
      VIEWS_SECRET_SHARED:PAGES_CURRENT
    })).toThrow(
      "VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON reference cannot be shared across services"
    );
  });

  it("rejects different references that resolve to the same raw key across services",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":["VIEWS_SECRET_PAGES_CURRENT"],
        "analytics-cron":["VIEWS_SECRET_CRON_CURRENT"]
      }),
      VIEWS_SECRET_PAGES_CURRENT:PAGES_CURRENT,
      VIEWS_SECRET_CRON_CURRENT:PAGES_CURRENT
    })).toThrow("Resolved internal service key cannot be shared across services");
  });

  it("deduplicates a repeated reference inside one service rotation ring",()=>{
    const config=loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":["VIEWS_SECRET_PAGES_CURRENT","VIEWS_SECRET_PAGES_CURRENT"]
      }),
      VIEWS_SECRET_PAGES_CURRENT:PAGES_CURRENT
    });
    expect(config.internalServiceKeys["pages-bff"]).toEqual([PAGES_CURRENT]);
  });

  it("continues validating the non-production raw service-key fallback",()=>{
    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"test",
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({
        "pages-bff":["too-short"]
      })
    })).toThrow("VIEWS_INTERNAL_SERVICE_KEYS_JSON keys must be at least 32 characters");

    expect(()=>loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"test",
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({
        "pages-bff":[PAGES_CURRENT],
        "analytics-cron":[PAGES_CURRENT]
      })
    })).toThrow(
      "VIEWS_INTERNAL_SERVICE_KEYS_JSON key cannot be shared across services"
    );
  });
});
