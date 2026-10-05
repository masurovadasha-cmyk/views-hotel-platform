import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsExportService} from "./analytics-export.service";
import {AnalyticsExportStorageRegistry} from "./analytics-export-storage.registry";
import type {
  AnalyticsExportPutInput,AnalyticsExportStoragePort
} from "./analytics-export-storage.port";
import {AnalyticsExportWorkerService} from "./analytics-export-worker.service";
import {AnalyticsQueryService} from "./analytics-query.service";
import {MarketplaceAnalyticsQueryService} from "./marketplace-analytics-query.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBERSHIP="30000000-0000-4000-8000-000000000001";
const FRONT_DESK_USER="20000000-0000-4000-8000-000000000002";
const FRONT_DESK_MEMBERSHIP="30000000-0000-4000-8000-000000000002";
const DATE="2034-06-10";

const actor={
  organizationId:ORG,userId:USER,membershipId:MEMBERSHIP,requestId:"export-integration"
};
const frontDeskActor={
  organizationId:ORG,userId:FRONT_DESK_USER,membershipId:FRONT_DESK_MEMBERSHIP,
  requestId:"export-front-desk"
};

class TestExportStorage implements AnalyticsExportStoragePort{
  readonly provider="test-export-storage";
  readonly objects=new Map<string,Uint8Array>();

  async putObject(input:AnalyticsExportPutInput){
    this.objects.set(input.objectKey,input.body);
    return {objectKey:input.objectKey,etag:"test-etag"};
  }

  async createDownloadUrl(input:{objectKey:string;expiresInSeconds:number}){
    expect(this.objects.has(input.objectKey)).toBe(true);
    expect(input.expiresInSeconds).toBe(900);
    return {
      url:"https://download.invalid/"+encodeURIComponent(input.objectKey),
      expiresAt:"2035-01-01T00:00:00.000Z"
    };
  }
}

const db=new DatabaseService();
const storageProvider=new TestExportStorage();
const storage=new AnalyticsExportStorageRegistry();
storage.register(storageProvider);
const queries=new AnalyticsQueryService(db);
const marketplace=new MarketplaceAnalyticsQueryService(db);
const exportsService=new AnalyticsExportService(db,storage);
const worker=new AnalyticsExportWorkerService(db,queries,marketplace,storage);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO analytics_property_daily_rollups(
         organization_id,property_id,local_date,currency,
         available_unit_nights,occupied_unit_nights,booking_count,
         accommodation_revenue_minor,gross_revenue_minor,net_revenue_minor,
         occupancy,adr_minor,revpar_minor,avg_lead_time_days,avg_stay_nights,refreshed_at
       ) VALUES(
         $1,$2,$3::date,'UZS',
         10,4,3,12000,14000,13000,
         0.4,3000,1200,7,2.5,now()
       )
       ON CONFLICT(organization_id,property_id,local_date,currency) DO UPDATE SET
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
         refreshed_at=now()`,
      [ORG,PROPERTY,DATE]
    );
  });
});

describe.sequential("Stage 6 analytics exports",()=>{
  let jobId="";

  it("creates an idempotent property export request",async()=>{
    const first=await exportsService.create(
      actor,
      {reportType:"property_daily",from:DATE,to:DATE,propertyId:PROPERTY},
      "export-property-daily-v1"
    );
    jobId=first.jobId;
    expect(first.status).toBe("pending");
    expect(first.idempotentReplay).toBe(false);

    const replay=await exportsService.create(
      actor,
      {reportType:"property_daily",from:DATE,to:DATE,propertyId:PROPERTY},
      "export-property-daily-v1"
    );
    expect(replay.jobId).toBe(jobId);
    expect(replay.idempotentReplay).toBe(true);

    await expect(exportsService.create(
      actor,
      {reportType:"property_daily",from:"2034-06-09",to:DATE,propertyId:PROPERTY},
      "export-property-daily-v1"
    )).rejects.toThrow("ANALYTICS_EXPORT_IDEMPOTENCY_CONFLICT");
  });

  it("leases, renders and stores a canonical CSV export",async()=>{
    const result=await worker.runCycle(10);
    expect(result.claimedJobs).toBeGreaterThanOrEqual(1);
    expect(result.failedJobs).toBe(0);

    const job=await exportsService.get(actor,jobId);
    expect(job.status).toBe("completed");
    expect(job.storageProvider).toBe("test-export-storage");
    expect(job.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Number(job.contentBytes)).toBeGreaterThan(0);

    const objectKey="analytics-exports/"+ORG+"/"+jobId+".csv";
    const bytes=storageProvider.objects.get(objectKey);
    if(!bytes)throw new Error("EXPECTED_EXPORT_OBJECT");

    const csv=new TextDecoder().decode(bytes);
    expect(csv).toContain("date,currency,availableUnitNights");
    expect(csv).toContain(DATE+",UZS,10,4,3,12000,14000,13000");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("creates a short-lived download URL only after completion",async()=>{
    const download=await exportsService.download(actor,jobId);
    expect(download.jobId).toBe(jobId);
    expect(download.url).toContain("https://download.invalid/");
    expect(download.expiresAt).toBe("2035-01-01T00:00:00.000Z");
  });

  it("cancels a pending export without storage work",async()=>{
    const created=await exportsService.create(
      actor,
      {reportType:"country_daily",from:DATE,to:DATE},
      "export-cancel-v1"
    );
    const cancelled=await exportsService.cancel(actor,created.jobId);
    expect(cancelled.status).toBe("cancelled");

    const job=await exportsService.get(actor,created.jobId);
    expect(job.status).toBe("cancelled");
  });

  it("rejects analytics export creation for a front desk role",async()=>{
    await expect(exportsService.create(
      frontDeskActor,
      {reportType:"property_daily",from:DATE,to:DATE,propertyId:PROPERTY},
      "export-front-desk-v1"
    )).rejects.toThrow("ANALYTICS_ROLE_FORBIDDEN");
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
