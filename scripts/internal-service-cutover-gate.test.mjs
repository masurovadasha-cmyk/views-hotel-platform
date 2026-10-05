import {describe,expect,it} from "vitest";
import {
  ServiceCutoverGateError,
  evaluateServiceCutoverPosture
} from "./internal-service-cutover-gate.mjs";

function posture(overrides={}){
  return {
    schemaVersion:1,
    migration:{
      ready:true,
      services:[
        {
          serviceId:"analytics-cron",
          signedRequestCount:4,
          legacyRequestCount:0,
          lastSignedAt:"2026-10-05T20:00:00.000Z",
          lastLegacyAt:null,
          ready:true
        },
        {
          serviceId:"pages-bff",
          signedRequestCount:8,
          legacyRequestCount:0,
          lastSignedAt:"2026-10-05T20:01:00.000Z",
          lastLegacyAt:null,
          ready:true
        }
      ]
    },
    credentials:[
      {
        serviceId:"analytics-cron",
        credentialId:"cron-2026-10",
        status:"healthy",
        observed:{requestCount:4}
      },
      {
        serviceId:"pages-bff",
        credentialId:"pages-2026-10",
        status:"healthy",
        observed:{requestCount:8}
      }
    ],
    alerts:[],
    ...overrides
  };
}

describe("signed-only cutover gate",()=>{
  it("passes only when expected services are signed-only and healthy",()=>{
    const result=evaluateServiceCutoverPosture(posture(),{
      expectedServices:["pages-bff","analytics-cron"]
    });
    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("blocks any observed legacy symmetric traffic",()=>{
    const input=posture();
    input.migration.ready=false;
    input.migration.services[0]={
      ...input.migration.services[0],
      legacyRequestCount:1,
      ready:false
    };
    input.alerts=[{
      code:"LEGACY_INTERNAL_KEY_TRAFFIC",
      serviceId:"analytics-cron",
      credentialId:null
    }];

    const result=evaluateServiceCutoverPosture(input);
    expect(result.ok).toBe(false);
    expect(result.blockers).toContainEqual({
      code:"LEGACY_TRAFFIC_PRESENT",
      serviceId:"analytics-cron",
      credentialId:null
    });
  });

  it("blocks a missing expected trusted service",()=>{
    const input=posture();
    input.migration.services=input.migration.services.filter(
      item=>item.serviceId!=="analytics-cron"
    );
    input.credentials=input.credentials.filter(
      item=>item.serviceId!=="analytics-cron"
    );

    const result=evaluateServiceCutoverPosture(input,{
      expectedServices:["pages-bff","analytics-cron"]
    });
    expect(result.blockers).toContainEqual({
      code:"EXPECTED_SERVICE_MISSING",
      serviceId:"analytics-cron",
      credentialId:null
    });
  });

  it("blocks overdue and due-soon credentials by default",()=>{
    const input=posture();
    input.credentials[0]={...input.credentials[0],status:"overdue"};
    input.credentials[1]={...input.credentials[1],status:"due_soon"};

    const result=evaluateServiceCutoverPosture(input);
    expect(result.ok).toBe(false);
    expect(result.blockers.map(item=>item.code)).toContain(
      "SIGNING_CREDENTIAL_OVERDUE"
    );
    expect(result.blockers.map(item=>item.code)).toContain(
      "SIGNING_CREDENTIAL_DUE_SOON"
    );

    const override=evaluateServiceCutoverPosture({
      ...input,
      credentials:[
        {...input.credentials[0],status:"healthy"},
        input.credentials[1]
      ]
    },{allowDueSoon:true});
    expect(override.ok).toBe(true);
    expect(override.warnings.map(item=>item.code)).toContain(
      "SIGNING_CREDENTIAL_DUE_SOON"
    );
  });

  it("requires observed traffic on a currently configured signing credential",()=>{
    const input=posture();
    input.credentials=input.credentials.map(item=>(
      item.serviceId==="pages-bff"
        ?{...item,observed:{requestCount:0}}
        :item
    ));
    const result=evaluateServiceCutoverPosture(input);
    expect(result.blockers).toContainEqual({
      code:"CONFIGURED_SIGNING_CREDENTIAL_TRAFFIC_MISSING",
      serviceId:"pages-bff",
      credentialId:null
    });
  });

  it("fails closed on malformed posture snapshots",()=>{
    expect(()=>evaluateServiceCutoverPosture({
      schemaVersion:1,
      migration:{ready:true,services:[]},
      credentials:"not-an-array",
      alerts:[]
    })).toThrow(ServiceCutoverGateError);

    expect(()=>evaluateServiceCutoverPosture({
      ...posture(),
      schemaVersion:2
    })).toThrow("UNSUPPORTED_POSTURE_SCHEMA");
  });
});
