import {
  generateKeyPairSync,
  verify as verifySignature
} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {
  AnalyticsCronError,
  createAnalyticsCronToken,
  loadAnalyticsCronConfig,
  runAnalyticsReportCycle
} from "./analytics-report-cycle.mjs";

const NOW=1_800_000_000;
const KEYS=generateKeyPairSync("ed25519");
const PRIVATE_PEM=KEYS.privateKey.export({
  format:"pem",type:"pkcs8"
}).toString();

function env(overrides={}){
  return {
    VIEWS_ENV:"production",
    VIEWS_CORE_API_URL:"https://core.views.example",
    VIEWS_ANALYTICS_CRON_SIGNING_KID:"analytics-cron-2026-10",
    VIEWS_ANALYTICS_CRON_SIGNING_PRIVATE_KEY:PRIVATE_PEM,
    ...overrides
  };
}

function decode(segment){
  return JSON.parse(
    Buffer.from(segment,"base64url").toString("utf8")
  );
}

describe("signed analytics cron runner",()=>{
  it("loads only an Ed25519 signing key and requires HTTPS in production",()=>{
    const config=loadAnalyticsCronConfig(env());
    expect(config.baseUrl).toBe("https://core.views.example");
    expect(config.kid).toBe("analytics-cron-2026-10");
    expect(config.privateKey.asymmetricKeyType).toBe("ed25519");

    expect(()=>loadAnalyticsCronConfig(env({
      VIEWS_CORE_API_URL:"http://core.views.example"
    }))).toThrow("CORE_API_URL_INSECURE");

    const rsa=generateKeyPairSync("rsa",{modulusLength:2048});
    expect(()=>loadAnalyticsCronConfig(env({
      VIEWS_ANALYTICS_CRON_SIGNING_PRIVATE_KEY:rsa.privateKey.export({
        format:"pem",type:"pkcs8"
      }).toString()
    }))).toThrow("ANALYTICS_CRON_SIGNING_KEY_INVALID");
  });

  it("mints the strict request-bound analytics-cron token profile",()=>{
    const config=loadAnalyticsCronConfig(env());
    const token=createAnalyticsCronToken({
      kid:config.kid,
      privateKey:config.privateKey,
      requestId:"analytics-cron-request-1",
      nowSeconds:NOW
    });
    const parts=token.split(".");
    expect(parts).toHaveLength(3);

    expect(decode(parts[0])).toEqual({
      alg:"EdDSA",
      typ:"views-service+jwt",
      kid:"analytics-cron-2026-10"
    });
    expect(decode(parts[1])).toMatchObject({
      iss:"analytics-cron",
      sub:"analytics-cron",
      aud:"views-core",
      iat:NOW,
      exp:NOW+30,
      htm:"POST",
      htp:"/v1/internal/analytics/report-cycle",
      rid:"analytics-cron-request-1"
    });

    expect(verifySignature(
      null,
      Buffer.from(parts[0]+"."+parts[1]),
      KEYS.publicKey,
      Buffer.from(parts[2],"base64url")
    )).toBe(true);
  });

  it("calls Core with a signed token and never sends a symmetric key",async()=>{
    const fetchImpl=vi.fn(async(input,init)=>{
      expect(String(input))
        .toBe("https://core.views.example/v1/internal/analytics/report-cycle");
      const headers=new Headers(init?.headers);
      expect(headers.get("x-views-service-id")).toBe("analytics-cron");
      expect(headers.get("x-views-service-token")).toBeTruthy();
      expect(headers.get("x-views-internal-key")).toBeNull();
      expect(headers.get("x-request-id")).toBe("analytics-cron-request-2");

      expect(JSON.parse(String(init?.body))).toEqual({
        scheduleLimit:3,
        reportLimit:4,
        pruneLimit:5
      });
      return Response.json({
        schedules:{claimed:1,enqueued:1},
        reports:{claimed:1,completed:1},
        retention:{pruned:0}
      });
    });

    const result=await runAnalyticsReportCycle({
      env:env(),
      fetchImpl,
      requestId:"analytics-cron-request-2",
      nowSeconds:NOW,
      scheduleLimit:3,
      reportLimit:4,
      pruneLimit:5,
      signal:new AbortController().signal
    });

    expect(result.status).toBe(200);
    expect(result.requestId).toBe("analytics-cron-request-2");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed on invalid limits without making a Core request",async()=>{
    const fetchImpl=vi.fn();
    await expect(runAnalyticsReportCycle({
      env:env(),
      fetchImpl,
      requestId:"analytics-cron-request-3",
      scheduleLimit:0,
      signal:new AbortController().signal
    })).rejects.toThrow("INVALID_REPORT_SCHEDULE_LIMIT");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns only normalized upstream machine codes",async()=>{
    const fetchImpl=vi.fn(async()=>new Response(
      JSON.stringify({
        error:"INTERNAL_API_UNAUTHORIZED",
        debug:"raw upstream details must not escape"
      }),
      {status:401,headers:{"content-type":"application/json"}}
    ));

    await expect(runAnalyticsReportCycle({
      env:env(),
      fetchImpl,
      requestId:"analytics-cron-request-4",
      signal:new AbortController().signal
    })).rejects.toMatchObject({
      code:"INTERNAL_API_UNAUTHORIZED",
      status:401
    });

    const unsafe=vi.fn(async()=>new Response(
      "<html>provider debug / secrets</html>",
      {status:502}
    ));
    await expect(runAnalyticsReportCycle({
      env:env(),
      fetchImpl:unsafe,
      requestId:"analytics-cron-request-5",
      signal:new AbortController().signal
    })).rejects.toMatchObject({
      code:"ANALYTICS_CRON_CORE_ERROR",
      status:502
    });
  });

  it("normalizes network failures without leaking the original error",async()=>{
    const fetchImpl=vi.fn(async()=>{
      throw new Error("socket failed with secret=value");
    });
    await expect(runAnalyticsReportCycle({
      env:env(),
      fetchImpl,
      requestId:"analytics-cron-request-6",
      signal:new AbortController().signal
    })).rejects.toEqual(
      expect.objectContaining({
        name:"AnalyticsCronError",
        code:"ANALYTICS_CRON_CORE_UNAVAILABLE"
      })
    );
  });
});
