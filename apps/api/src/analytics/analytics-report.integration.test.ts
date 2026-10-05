import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsReportService} from "./analytics-report.service";
import {AnalyticsReportWorkerService} from "./analytics-report-worker.service";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";

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

const DATE="2036-01-15";
const PREVIOUS_DATE="2036-01-14";

const db=new DatabaseService();
const dashboard=new AnalyticsDashboardService(db);
const reports=new AnalyticsReportService(db);
const worker=new AnalyticsReportWorkerService(db,dashboard);

beforeAll(async()=>{
  await db.withActor(MANAGER,async client=>{
    await client.query(
      `INSERT INTO analytics_property_daily_rollups(
         organization_id,property_id,local_date,currency,
         available_unit_nights,occupied_unit_nights,booking_count,
         accommodation_revenue_minor,gross_revenue_minor,net_revenue_minor,
         occupancy,adr_minor,revpar_minor,avg_lead_time_days,avg_stay_nights,refreshed_at
       ) VALUES
       ($1,$2,$3::date,'UZS',10,4,2,8000,9000,8000,0.4,2000,800,10,2,'2036-01-16T00:00:00Z'),
       ($1,$2,$4::date,'UZS',10,2,1,3000,3500,3000,0.2,1500,300,8,2,'2036-01-16T00:00:00Z')
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
      [ORG,PROPERTY,DATE,PREVIOUS_DATE]
    );

    await client.query(
      `DELETE FROM analytics_report_artifacts
        WHERE organization_id=$1
          AND report_job_id IN (
            SELECT id FROM analytics_report_jobs
            WHERE organization_id=$1
              AND from_date=$2::date
              AND to_date=$2::date
          )`,
      [ORG,DATE]
    );
    await client.query(
      `DELETE FROM analytics_report_jobs
        WHERE organization_id=$1
          AND from_date=$2::date
          AND to_date=$2::date`,
      [ORG,DATE]
    );
  });
});

describe.sequential("Stage 6 durable report exports",()=>{
  let jsonJobId="";

  it("creates and idempotently replays one dashboard JSON job",async()=>{
    const first=await reports.create(MANAGER,{
      reportType:"dashboard_summary",
      format:"json",
      from:DATE,
      to:DATE,
      propertyId:PROPERTY
    },"report-json-v1");
    if(!first)throw new Error("EXPECTED_REPORT_JOB");

    jsonJobId=first.reportJobId;
    expect(first.status).toBe("queued");
    expect(first.idempotentReplay).toBe(false);

    const replay=await reports.create(MANAGER,{
      reportType:"dashboard_summary",
      format:"json",
      from:DATE,
      to:DATE,
      propertyId:PROPERTY
    },"report-json-v1");
    if(!replay)throw new Error("EXPECTED_REPORT_REPLAY");

    expect(replay.reportJobId).toBe(jsonJobId);
    expect(replay.idempotentReplay).toBe(true);

    await expect(reports.create(MANAGER,{
      reportType:"dashboard_summary",
      format:"csv",
      from:DATE,
      to:DATE,
      propertyId:PROPERTY
    },"report-json-v1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("processes the leased job and stores an immutable JSON artifact",async()=>{
    const cycle=await worker.runCycle(20);
    expect(cycle.completed).toBeGreaterThanOrEqual(1);

    const job=await reports.get(MANAGER,jsonJobId);
    if(!job)throw new Error("EXPECTED_COMPLETED_REPORT");
    expect(job.status).toBe("completed");
    expect(job.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(job.artifact?.contentType).toBe("application/json");
    expect(job.artifact?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    const artifact=await reports.artifact(MANAGER,jsonJobId);
    expect(artifact.byteSize).toBe(artifact.content.length);
    expect(artifact.filename).toMatch(/\.json$/);

    const parsed=JSON.parse(artifact.content.toString("utf8"));
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.cache).toBeUndefined();
    expect(parsed.period).toEqual({from:DATE,to:DATE});
    expect(parsed.kpisByCurrency[0]).toMatchObject({
      currency:"UZS",
      availableUnitNights:10,
      occupiedUnitNights:4,
      accommodationRevenueMinor:"8000",
      adrMinor:"2000.00",
      revparMinor:"800.00"
    });
    expect(parsed.freshness.sourceFingerprint).toBe(job.sourceFingerprint);
  });

  it("creates and renders a CSV artifact from the same canonical dashboard model",async()=>{
    const created=await reports.create(MANAGER,{
      reportType:"dashboard_summary",
      format:"csv",
      from:DATE,
      to:DATE,
      propertyId:PROPERTY
    },"report-csv-v1");
    if(!created)throw new Error("EXPECTED_CSV_JOB");

    const cycle=await worker.runCycle(20);
    expect(cycle.completed).toBeGreaterThanOrEqual(1);

    const artifact=await reports.artifact(MANAGER,created.reportJobId);
    const csv=artifact.content.toString("utf8");

    expect(artifact.contentType).toBe("text/csv; charset=utf-8");
    expect(artifact.filename).toMatch(/\.csv$/);
    expect(csv).toContain("path,value");
    expect(csv).toContain("kpisByCurrency[0].currency,UZS");
    expect(csv).toContain("kpisByCurrency[0].accommodationRevenueMinor,8000");
    expect(csv).not.toContain("cache.hit");
  });

  it("hides a manager report from a scoped host through report RLS",async()=>{
    await expect(reports.get(HOST,jsonJobId))
      .rejects.toThrow("REPORT_JOB_NOT_FOUND");

    await expect(reports.artifact(HOST,jsonJobId))
      .rejects.toThrow("REPORT_JOB_NOT_FOUND");
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
