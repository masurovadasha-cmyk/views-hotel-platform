import {createHash} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";
import {AnalyticsReportService} from "./analytics-report.service";
import {AnalyticsReportWorkerService} from "./analytics-report-worker.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const OTHER_PROPERTY="ac000000-0000-4000-8000-000000000001";
const DATE="2036-09-10";

const MANAGER={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"report-manager"
};

const HOST={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000004",
  membershipId:"30000000-0000-4000-8000-000000000004",
  requestId:"report-host"
};

const db=new DatabaseService();
const dashboard=new AnalyticsDashboardService(db);
const reports=new AnalyticsReportService(db);
const worker=new AnalyticsReportWorkerService(db,dashboard);

beforeAll(async()=>{
  await db.withActor(MANAGER,async client=>{
    await client.query(
      `INSERT INTO properties(
         id,organization_id,name,country_code,city,timezone,address,status
       ) VALUES(
         $1,$2,'{"en":"Report Test B"}'::jsonb,
         'UZ','Bukhara','Asia/Tashkent','{}'::jsonb,'active'
       )
       ON CONFLICT(id) DO NOTHING`,
      [OTHER_PROPERTY,ORG]
    );

    await client.query(
      `INSERT INTO analytics_property_daily_rollups(
         organization_id,property_id,local_date,currency,
         available_unit_nights,occupied_unit_nights,booking_count,
         accommodation_revenue_minor,gross_revenue_minor,net_revenue_minor,
         occupancy,adr_minor,revpar_minor,
         avg_lead_time_days,avg_stay_nights,refreshed_at
       ) VALUES(
         $1,$2,$3::date,'UZS',
         12,6,3,12000,13200,11000,
         0.5,2000,1000,9,2,'2036-09-11T00:00:00Z'
       )
       ON CONFLICT(organization_id,property_id,local_date,currency)
       DO UPDATE SET
         available_unit_nights=EXCLUDED.available_unit_nights,
         occupied_unit_nights=EXCLUDED.occupied_unit_nights,
         booking_count=EXCLUDED.booking_count,
         accommodation_revenue_minor=EXCLUDED.accommodation_revenue_minor,
         gross_revenue_minor=EXCLUDED.gross_revenue_minor,
         net_revenue_minor=EXCLUDED.net_revenue_minor,
         occupancy=EXCLUDED.occupancy,
         adr_minor=EXCLUDED.adr_minor,
         revpar_minor=EXCLUDED.revpar_minor,
         avg_lead_time_days=EXCLUDED.avg_lead_time_days,
         avg_stay_nights=EXCLUDED.avg_stay_nights,
         refreshed_at=EXCLUDED.refreshed_at`,
      [ORG,PROPERTY,DATE]
    );
  });
});

describe.sequential("Stage 6 durable analytics report exports",()=>{
  let jsonJobId="";

  it("creates an idempotent JSON report job and rejects key reuse with a different request",async()=>{
    const first=await reports.create(
      MANAGER,
      {from:DATE,to:DATE,propertyId:PROPERTY,format:"json"},
      "report-json-v1"
    );
    const replay=await reports.create(
      MANAGER,
      {from:DATE,to:DATE,propertyId:PROPERTY,format:"json"},
      "report-json-v1"
    );

    jsonJobId=first.jobId;
    expect(first.status).toBe("queued");
    expect(first.idempotentReplay).toBe(false);
    expect(replay.jobId).toBe(first.jobId);
    expect(replay.idempotentReplay).toBe(true);

    await expect(reports.create(
      MANAGER,
      {from:DATE,to:DATE,propertyId:PROPERTY,format:"csv"},
      "report-json-v1"
    )).rejects.toThrow("REPORT_IDEMPOTENCY_CONFLICT");

    await expect(reports.content(MANAGER,jsonJobId))
      .rejects.toThrow("REPORT_NOT_READY");
  });

  it("generates an immutable JSON snapshot with content integrity metadata",async()=>{
    const cycle=await worker.runCycle(20);
    expect(cycle.completedJobs).toBeGreaterThanOrEqual(1);

    const status=await reports.get(MANAGER,jsonJobId);
    expect(status.status).toBe("completed");
    expect(status.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(status.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(status.fileName).toContain(".json");

    const content=await reports.content(MANAGER,jsonJobId);
    expect(content.contentType).toBe("application/json; charset=utf-8");
    expect(sha256(content.content)).toBe(content.contentSha256);

    const parsed=JSON.parse(content.content) as any;
    expect(parsed.report).toMatchObject({
      schemaVersion:1,
      kind:"dashboard_summary",
      format:"json"
    });
    expect(parsed.dashboard.schemaVersion).toBe(2);
    expect(parsed.dashboard.scope.propertyId).toBe(PROPERTY);
    expect(parsed.dashboard.kpisByCurrency[0]).toMatchObject({
      currency:"UZS",
      accommodationRevenueMinor:"12000"
    });

    await expect(db.withActor(MANAGER,async client=>{
      await client.query(
        "UPDATE analytics_report_jobs SET content_text='tampered' WHERE id=$1",
        [jsonJobId]
      );
    })).rejects.toThrow(/completed analytics report job is immutable/i);
  });

  it("generates deterministic CSV from the same canonical dashboard model",async()=>{
    const created=await reports.create(
      MANAGER,
      {from:DATE,to:DATE,propertyId:PROPERTY,format:"csv"},
      "report-csv-v1"
    );
    expect(created.status).toBe("queued");

    const cycle=await worker.runCycle(20);
    expect(cycle.completedJobs).toBeGreaterThanOrEqual(1);

    const content=await reports.content(MANAGER,created.jobId);
    expect(content.contentType).toBe("text/csv; charset=utf-8");
    expect(content.fileName).toContain(".csv");
    expect(content.content.startsWith("section,currency,dimension,metric,value\r\n"))
      .toBe(true);
    expect(content.content).toContain("hospitality,UZS");
    expect(content.content).toContain("accommodationRevenueMinor,12000");
    expect(sha256(content.content)).toBe(content.contentSha256);
  });

  it("enforces membership and property scope on jobs and content",async()=>{
    await expect(reports.get(HOST,jsonJobId))
      .rejects.toThrow("REPORT_JOB_NOT_FOUND");

    await expect(reports.create(
      HOST,
      {from:DATE,to:DATE,propertyId:OTHER_PROPERTY,format:"json"},
      "host-forbidden-report"
    )).rejects.toThrow("PROPERTY_FORBIDDEN");

    const hostJob=await reports.create(
      HOST,
      {from:DATE,to:DATE,propertyId:PROPERTY,format:"json"},
      "host-scoped-report"
    );
    await worker.runCycle(20);
    const hostContent=await reports.content(HOST,hostJob.jobId);
    const parsed=JSON.parse(hostContent.content) as any;
    expect(parsed.dashboard.scope.propertyId).toBe(PROPERTY);
  });
});

function sha256(value:string){
  return createHash("sha256").update(value).digest("hex");
}

afterAll(async()=>{await db.onModuleDestroy()});
