import {describe,expect,it} from "vitest";
import {
  buildInternalServicePosture,
  type InternalServicePostureRow
} from "./internal-service-posture.service";

const NOW=new Date("2026-12-20T00:00:00.000Z");

function row(input:Partial<InternalServicePostureRow>&Pick<
  InternalServicePostureRow,"service_id"|"auth_scheme"
>):InternalServicePostureRow{
  return {
    service_id:input.service_id,
    auth_scheme:input.auth_scheme,
    credential_id:input.credential_id??null,
    key_fingerprint:input.key_fingerprint??"a".repeat(32),
    request_count:input.request_count??"1",
    first_seen_at:input.first_seen_at??new Date("2026-12-19T00:00:00.000Z"),
    last_seen_at:input.last_seen_at??new Date("2026-12-19T12:00:00.000Z")
  };
}

function key(
  kid:string,
  rotateBy:string,
  activatedAt="2026-10-01T00:00:00.000Z"
){
  return {
    kid,
    publicKeyPem:"-----BEGIN PUBLIC KEY-----\nfixture\n-----END PUBLIC KEY-----",
    activatedAt,
    rotateBy
  };
}

describe("internal service credential posture",()=>{
  it("blocks migration readiness on legacy traffic and emits rotation SLO alerts",()=>{
    const rows=[
      row({
        service_id:"pages-bff",
        auth_scheme:"signed_token",
        credential_id:"pages-2026-10",
        request_count:"5",
        key_fingerprint:"a".repeat(32)
      }),
      row({
        service_id:"analytics-cron",
        auth_scheme:"signed_token",
        credential_id:"cron-2026-10",
        request_count:"3",
        key_fingerprint:"b".repeat(32)
      }),
      row({
        service_id:"analytics-cron",
        auth_scheme:"internal_key",
        request_count:"1",
        key_fingerprint:"c".repeat(32)
      })
    ];

    const result=buildInternalServicePosture({
      rows,
      serviceKeys:{
        "pages-bff":["legacy-pages"],
        "analytics-cron":["legacy-cron"]
      },
      servicePublicKeys:{
        "pages-bff":[key("pages-2026-10","2027-01-01T00:00:00.000Z")],
        "analytics-cron":[key("cron-2026-10","2026-12-15T00:00:00.000Z")]
      },
      hours:24,
      now:NOW
    });

    expect(result.migration.ready).toBe(false);
    expect(result.migration.services).toEqual([
      expect.objectContaining({
        serviceId:"analytics-cron",
        signedRequestCount:3,
        legacyRequestCount:1,
        ready:false
      }),
      expect.objectContaining({
        serviceId:"pages-bff",
        signedRequestCount:5,
        legacyRequestCount:0,
        ready:true
      })
    ]);

    expect(result.credentials).toEqual([
      expect.objectContaining({
        serviceId:"analytics-cron",
        credentialId:"cron-2026-10",
        status:"overdue",
        observed:expect.objectContaining({requestCount:3})
      }),
      expect.objectContaining({
        serviceId:"pages-bff",
        credentialId:"pages-2026-10",
        status:"due_soon",
        observed:expect.objectContaining({
          requestCount:5,
          keyFingerprints:["a".repeat(32)]
        })
      })
    ]);

    expect(result.alerts).toContainEqual({
      code:"LEGACY_INTERNAL_KEY_TRAFFIC",
      serviceId:"analytics-cron",
      credentialId:null
    });
    expect(result.alerts).toContainEqual({
      code:"SIGNED_CREDENTIAL_ROTATION_OVERDUE",
      serviceId:"analytics-cron",
      credentialId:"cron-2026-10"
    });
    expect(result.alerts).toContainEqual({
      code:"SIGNED_CREDENTIAL_ROTATION_DUE_SOON",
      serviceId:"pages-bff",
      credentialId:"pages-2026-10"
    });
  });

  it("requires observed signed traffic for every known service before migration is ready",()=>{
    const result=buildInternalServicePosture({
      rows:[
        row({
          service_id:"pages-bff",
          auth_scheme:"signed_token",
          credential_id:"pages-current",
          request_count:"2"
        })
      ],
      serviceKeys:{
        "pages-bff":["legacy-pages"],
        "analytics-cron":["legacy-cron"]
      },
      servicePublicKeys:{
        "pages-bff":[key("pages-current","2027-03-01T00:00:00.000Z")],
        "analytics-cron":[key("cron-current","2027-03-01T00:00:00.000Z")]
      },
      hours:24,
      now:NOW
    });

    expect(result.migration.ready).toBe(false);
    expect(result.migration.services.find(
      service=>service.serviceId==="analytics-cron"
    )).toMatchObject({
      signedRequestCount:0,
      legacyRequestCount:0,
      ready:false
    });
    expect(result.alerts).toContainEqual({
      code:"SIGNED_SERVICE_TRAFFIC_MISSING",
      serviceId:"analytics-cron",
      credentialId:null
    });
  });

  it("becomes ready only when all known services are signed-only in the window",()=>{
    const result=buildInternalServicePosture({
      rows:[
        row({
          service_id:"pages-bff",
          auth_scheme:"signed_token",
          credential_id:"pages-current"
        }),
        row({
          service_id:"analytics-cron",
          auth_scheme:"signed_token",
          credential_id:"cron-current"
        })
      ],
      serviceKeys:{
        "pages-bff":["legacy-pages"],
        "analytics-cron":["legacy-cron"]
      },
      servicePublicKeys:{
        "pages-bff":[key("pages-current","2027-03-01T00:00:00.000Z")],
        "analytics-cron":[key("cron-current","2027-03-01T00:00:00.000Z")]
      },
      hours:24,
      now:NOW
    });

    expect(result.migration.ready).toBe(true);
    expect(result.migration.services.every(service=>service.ready)).toBe(true);
    expect(result.alerts).toHaveLength(0);
  });

  it("rejects posture windows outside the bounded 90-day range",()=>{
    expect(()=>buildInternalServicePosture({
      rows:[],
      serviceKeys:{},
      servicePublicKeys:{},
      hours:0,
      now:NOW
    })).toThrow("INVALID_INTERNAL_SERVICE_POSTURE_HOURS");

    expect(()=>buildInternalServicePosture({
      rows:[],
      serviceKeys:{},
      servicePublicKeys:{},
      hours:24*90+1,
      now:NOW
    })).toThrow("INVALID_INTERNAL_SERVICE_POSTURE_HOURS");
  });
});
