import {generateKeyPairSync} from "node:crypto";
import {describe,expect,it} from "vitest";
import {loadConfig} from "../config";

const GUEST_SECRET="fixture-production-rate-limit-key-material";
const CURRENT="fixture-current-internal-api-key-material";
const PREVIOUS="fixture-previous-internal-api-key-material";
const PAGES_CURRENT="fixture-pages-bff-current-key-material";
const PAGES_PREVIOUS="fixture-pages-bff-previous-key-material";
const CRON_CURRENT="fixture-analytics-cron-current-key-material";
const PAGES_SIGNING=generateKeyPairSync("ed25519");
const CRON_SIGNING=generateKeyPairSync("ed25519");
const PAGES_PUBLIC=PAGES_SIGNING.publicKey.export({format:"pem",type:"spki"}).toString();
const CRON_PUBLIC=CRON_SIGNING.publicKey.export({format:"pem",type:"spki"}).toString();
const ACTIVATED="2026-10-01T00:00:00.000Z";
const ROTATE_BY="2027-01-01T00:00:00.000Z";

function signingRef(kid:string,ref:string){
  return {kid,ref,activatedAt:ACTIVATED,rotateBy:ROTATE_BY};
}

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
    GUEST_AUTH_RATE_LIMIT_SECRET:GUEST_SECRET,
    VIEWS_TRUSTED_PROXY_CIDRS_JSON:JSON.stringify(["203.0.113.0/24","2001:db8::/32"])
  } as NodeJS.ProcessEnv;
}

function managed(){
  return {
    ...base(),
    VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:JSON.stringify({
      "pages-bff":"internal_key_only",
      "analytics-cron":"internal_key_only"
    }),
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

  it("requires explicit per-service auth modes in production",()=>{
    expect(()=>loadConfig(base()))
      .toThrow("VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON is required in production");
  });

  it("resolves production service rings from individually injected secrets",()=>{
    const config=loadConfig(managed());
    expect(config.internalServiceKeys).toEqual({
      "pages-bff":[PAGES_CURRENT,PAGES_PREVIOUS],
      "analytics-cron":[CRON_CURRENT]
    });
  });

  it("rejects raw service-key JSON in production",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:JSON.stringify({
        "pages-bff":"internal_key_only",
        "analytics-cron":"internal_key_only"
      }),
      VIEWS_INTERNAL_SERVICE_KEYS_JSON:RAW_SERVICE_KEYS
    })).toThrow("VIEWS_INTERNAL_SERVICE_KEYS_JSON is not allowed in production");
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
      VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:JSON.stringify({
        "pages-bff":"internal_key_only"
      }),
      VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":["VIEWS_SECRET_PAGES_CURRENT","VIEWS_SECRET_PAGES_CURRENT"]
      }),
      VIEWS_SECRET_PAGES_CURRENT:PAGES_CURRENT
    });
    expect(config.internalServiceKeys["pages-bff"]).toEqual([PAGES_CURRENT]);
  });

  it("loads Ed25519 service public keys from explicit references",()=>{
    const config=loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":[signingRef("pages-2026-10","VIEWS_PAGES_PUBLIC")],
        "analytics-cron":[signingRef("cron-2026-10","VIEWS_CRON_PUBLIC")]
      }),
      VIEWS_PAGES_PUBLIC:PAGES_PUBLIC,
      VIEWS_CRON_PUBLIC:CRON_PUBLIC
    });

    expect(config.internalServicePublicKeys["pages-bff"]).toEqual([
      {
        kid:"pages-2026-10",
        publicKeyPem:PAGES_PUBLIC.trim(),
        activatedAt:ACTIVATED,
        rotateBy:ROTATE_BY
      }
    ]);
    expect(config.internalServicePublicKeys["analytics-cron"]).toEqual([
      {
        kid:"cron-2026-10",
        publicKeyPem:CRON_PUBLIC.trim(),
        activatedAt:ACTIVATED,
        rotateBy:ROTATE_BY
      }
    ]);
  });

  it("requires valid signing-key rotation metadata in production",()=>{
    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":[{kid:"pages-2026-10",ref:"VIEWS_PAGES_PUBLIC"}]
      }),
      VIEWS_PAGES_PUBLIC:PAGES_PUBLIC
    })).toThrow(
      "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON production keys require activatedAt and rotateBy"
    );

    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":[{
          kid:"pages-2026-10",
          ref:"VIEWS_PAGES_PUBLIC",
          activatedAt:ROTATE_BY,
          rotateBy:ACTIVATED
        }]
      }),
      VIEWS_PAGES_PUBLIC:PAGES_PUBLIC
    })).toThrow(
      "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON rotateBy must be after activatedAt"
    );
  });

  it("keeps rotation metadata optional for non-production signing fixtures",()=>{
    const config=loadConfig({
      DATABASE_URL:"postgresql://example.invalid/views",
      NODE_ENV:"test",
      VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":[{kid:"pages-2026-10",ref:"VIEWS_PAGES_PUBLIC"}]
      }),
      VIEWS_PAGES_PUBLIC:PAGES_PUBLIC
    });
    expect(config.internalServicePublicKeys["pages-bff"][0]).toMatchObject({
      kid:"pages-2026-10",
      activatedAt:null,
      rotateBy:null
    });
  });

  it("rejects malformed signing-key references and non-Ed25519 keys",()=>{
    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":[{kid:"bad kid",ref:"VIEWS_PAGES_PUBLIC"}]
      }),
      VIEWS_PAGES_PUBLIC:PAGES_PUBLIC
    })).toThrow(
      "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON contains invalid kid or reference"
    );

    const rsa=generateKeyPairSync("rsa",{modulusLength:2048});
    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":[signingRef("pages-2026-10","VIEWS_PAGES_PUBLIC")]
      }),
      VIEWS_PAGES_PUBLIC:rsa.publicKey.export({format:"pem",type:"spki"}).toString()
    })).toThrow(
      "Referenced internal service public key VIEWS_PAGES_PUBLIC must be Ed25519"
    );
  });

  it("rejects signing-key reuse across service identities",()=>{
    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":[signingRef("pages-2026-10","VIEWS_PAGES_PUBLIC")],
        "analytics-cron":[signingRef("cron-2026-10","VIEWS_CRON_PUBLIC")]
      }),
      VIEWS_PAGES_PUBLIC:PAGES_PUBLIC,
      VIEWS_CRON_PUBLIC:PAGES_PUBLIC
    })).toThrow("Resolved internal service public key cannot be shared across services");
  });

  it("supports signed-only production services without symmetric secrets",()=>{
    const config=loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:JSON.stringify({
        "pages-bff":"signed_only"
      }),
      VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":[signingRef("pages-2026-10","VIEWS_PAGES_PUBLIC")]
      }),
      VIEWS_PAGES_PUBLIC:PAGES_PUBLIC
    });

    expect(config.internalServiceKeys).toEqual({});
    expect(config.internalServiceAuthModes).toEqual({
      "pages-bff":"signed_only"
    });
    expect(config.internalServicePublicKeys["pages-bff"]).toHaveLength(1);
  });

  it("requires both credential types for dual mode",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:JSON.stringify({
        "pages-bff":"dual"
      }),
      VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:JSON.stringify({
        "pages-bff":[signingRef("pages-2026-10","VIEWS_PAGES_PUBLIC")]
      }),
      VIEWS_PAGES_PUBLIC:PAGES_PUBLIC
    })).toThrow("dual service requires symmetric and signing credentials");
  });

  it("requires a signing key for signed-only mode",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:JSON.stringify({
        "pages-bff":"signed_only"
      })
    })).toThrow("signed_only service requires signing public keys");
  });

  it("requires a symmetric key for internal-key-only mode",()=>{
    expect(()=>loadConfig({
      ...base(),
      VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:JSON.stringify({
        "pages-bff":"internal_key_only"
      })
    })).toThrow("internal_key_only service requires a symmetric service key");
  });

  it("rejects undeclared or invalid production auth modes",()=>{
    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:JSON.stringify({
        "pages-bff":"not-a-mode",
        "analytics-cron":"internal_key_only"
      })
    })).toThrow("VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON contains invalid auth mode");

    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:JSON.stringify({
        "pages-bff":"internal_key_only"
      })
    })).toThrow(
      "VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON must declare every production service"
    );
  });

  it("requires trusted reverse-proxy CIDRs in cloudflare production mode",()=>{
    const input=managed();
    delete input.VIEWS_TRUSTED_PROXY_CIDRS_JSON;
    expect(()=>loadConfig(input)).toThrow(
      "VIEWS_TRUSTED_PROXY_CIDRS_JSON is required in cloudflare production mode"
    );
  });

  it("requires per-service source CIDRs in direct production mode",()=>{
    expect(()=>loadConfig({
      ...managed(),
      TRUSTED_PROXY_MODE:"direct",
      VIEWS_TRUSTED_PROXY_CIDRS_JSON:undefined
    })).toThrow(
      "VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON must declare every direct-mode production service"
    );

    const config=loadConfig({
      ...managed(),
      TRUSTED_PROXY_MODE:"direct",
      VIEWS_TRUSTED_PROXY_CIDRS_JSON:undefined,
      VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON:JSON.stringify({
        "pages-bff":["198.51.100.0/24"],
        "analytics-cron":["2001:db8:7::/48"]
      })
    });
    expect(config.internalServiceSourceCidrs["pages-bff"])
      .toEqual(["198.51.100.0/24"]);
  });

  it("validates proxy and per-service source CIDRs",()=>{
    expect(()=>loadConfig({
      ...managed(),
      VIEWS_TRUSTED_PROXY_CIDRS_JSON:JSON.stringify(["not-a-cidr"])
    })).toThrow("INVALID_NETWORK_CIDR");

    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON:JSON.stringify({
        "pages-bff":["198.51.100.0/33"]
      })
    })).toThrow("INVALID_NETWORK_CIDR");
  });

  it("rejects production source policies for unknown services",()=>{
    expect(()=>loadConfig({
      ...managed(),
      VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON:JSON.stringify({
        "unknown-service":["198.51.100.0/24"]
      })
    })).toThrow(
      "VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON contains an unknown production service"
    );
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
