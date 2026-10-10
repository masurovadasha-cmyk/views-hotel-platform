import {afterAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {InternalServiceAuditService} from "./internal-service-audit.service";
import {InternalServicePostureService} from "./internal-service-posture.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PLATFORM={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000005",
  membershipId:"30000000-0000-4000-8000-000000000005",
  requestId:"service-posture-platform"
};
const MANAGER={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"service-posture-manager"
};

const db=new DatabaseService();
const audit=new InternalServiceAuditService(db);
const posture=new InternalServicePostureService(db);

describe.sequential("Stage 7 credential posture boundary",()=>{
  it("aggregates signed and legacy traffic across tenantless internal calls for platform admin",async()=>{
    const legacyId=await audit.begin({
      organizationId:null,
      actorUserId:null,
      actorMembershipId:null,
      serviceId:"posture-fixture",
      keyFingerprint:"d".repeat(32),
      requestId:"posture-legacy",
      httpMethod:"POST",
      routePath:"Fixture.legacy",
      authScheme:"internal_key",
      credentialId:null,
      tokenJti:null
    });
    await audit.complete(legacyId,200,null);

    const signedId=await audit.begin({
      organizationId:null,
      actorUserId:null,
      actorMembershipId:null,
      serviceId:"posture-fixture",
      keyFingerprint:"e".repeat(32),
      requestId:"posture-signed",
      httpMethod:"POST",
      routePath:"Fixture.signed",
      authScheme:"signed_token",
      credentialId:"posture-2026-10",
      tokenJti:"70000000-0000-4000-8000-000000000199"
    });
    await audit.complete(signedId,200,null);

    const result=await posture.get(PLATFORM,24);
    const service=result.migration.services.find(
      item=>item.serviceId==="posture-fixture"
    );
    expect(service).toMatchObject({
      signedRequestCount:1,
      legacyRequestCount:1,
      ready:false
    });
    expect(result.alerts).toContainEqual({
      code:"LEGACY_INTERNAL_KEY_TRAFFIC",
      serviceId:"posture-fixture",
      credentialId:null
    });
  });

  it("denies posture aggregation to a non-platform manager",async()=>{
    await expect(posture.get(MANAGER,24))
      .rejects.toThrow(/INTERNAL_SERVICE_POSTURE_ROLE_FORBIDDEN/);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
