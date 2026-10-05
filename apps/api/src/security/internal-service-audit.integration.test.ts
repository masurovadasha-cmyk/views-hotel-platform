import {afterAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {InternalServiceAuditService} from "./internal-service-audit.service";

const ORG="00000000-0000-0000-0000-000000000001";
const MANAGER={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"service-audit-manager"
};
const HOST={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000004",
  membershipId:"30000000-0000-4000-8000-000000000004",
  requestId:"service-audit-host"
};

const db=new DatabaseService();
const audit=new InternalServiceAuditService(db);
let auditId="";

describe.sequential("Stage 7 trusted-service request audit",()=>{
  it("writes a started row through the security-definer boundary and completes it",async()=>{
    auditId=await audit.begin({
      organizationId:ORG,
      actorUserId:MANAGER.userId,
      actorMembershipId:MANAGER.membershipId,
      serviceId:"pages-bff",
      keyFingerprint:"a".repeat(32),
      requestId:"stage7-audit-success",
      httpMethod:"GET",
      routePath:"AnalyticsDashboardController.summary"
    });

    expect(auditId).toMatch(/^[0-9a-f-]{36}$/);

    await expect(audit.complete(auditId,200,null)).resolves.toBe(true);

    const rows=await audit.list(MANAGER,20,"pages-bff");
    const row=rows.find(x=>x.auditId===auditId);
    if(!row)throw new Error("EXPECTED_INTERNAL_SERVICE_AUDIT_ROW");

    expect(row).toMatchObject({
      serviceId:"pages-bff",
      keyFingerprint:"a".repeat(32),
      requestId:"stage7-audit-success",
      method:"GET",
      endpoint:"AnalyticsDashboardController.summary",
      statusCode:200,
      outcome:"succeeded",
      errorCode:null,
      actorUserId:MANAGER.userId,
      actorMembershipId:MANAGER.membershipId
    });
    expect(row.completedAt).not.toBeNull();
    expect(row.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records normalized failures without storing a raw internal key",async()=>{
    const failedId=await audit.begin({
      organizationId:ORG,
      actorUserId:MANAGER.userId,
      actorMembershipId:MANAGER.membershipId,
      serviceId:"analytics-cron",
      keyFingerprint:"b".repeat(32),
      requestId:"stage7-audit-failure",
      httpMethod:"POST",
      routePath:"AnalyticsInternalJobsController.reportCycle"
    });
    await audit.complete(failedId,500,"REPORT_WORKER_FAILURE");

    const rows=await audit.list(MANAGER,20,"analytics-cron");
    const row=rows.find(x=>x.auditId===failedId);
    if(!row)throw new Error("EXPECTED_FAILED_INTERNAL_SERVICE_AUDIT_ROW");

    expect(row.outcome).toBe("failed");
    expect(row.statusCode).toBe(500);
    expect(row.errorCode).toBe("REPORT_WORKER_FAILURE");
    expect(JSON.stringify(row)).not.toContain("internal-api-key");
  });

  it("does not allow a scoped host to read the security audit",async()=>{
    await expect(audit.list(HOST,20))
      .rejects.toThrow("SECURITY_AUDIT_ROLE_FORBIDDEN");

    const visible=await db.withActor(HOST,async client=>{
      return (await client.query<{count:string}>(
        "SELECT count(*)::text AS count FROM internal_service_request_audit"
      )).rows[0].count;
    });
    expect(Number(visible)).toBe(0);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
