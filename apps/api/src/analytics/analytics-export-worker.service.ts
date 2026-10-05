import {createHash,randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {AnalyticsQueryService} from "./analytics-query.service";
import {MarketplaceAnalyticsQueryService} from "./marketplace-analytics-query.service";
import {AnalyticsExportStorageRegistry} from "./analytics-export-storage.registry";
import {csvRows} from "./analytics-csv";
import type {AnalyticsExportReportType} from "./analytics-export.service";

const LEASE_SECONDS=300;
const MAX_EXPORT_BYTES=10*1024*1024;

const HEADERS:Record<AnalyticsExportReportType,string[]>={
  property_daily:[
    "date","currency","availableUnitNights","occupiedUnitNights","bookingCount",
    "accommodationRevenueMinor","grossRevenueMinor","netRevenueMinor",
    "occupancy","adrMinor","revparMinor","avgLeadTimeDays","avgStayNights","refreshedAt"
  ],
  booking_cohorts:[
    "arrivalDate","currency","bookingChannel","marketSegment","bookingCount",
    "activeOrStayedCount","cancellationCount","noShowCount","cancellationRate",
    "noShowRate","avgLeadTimeDays","avgStayNights","avgCancellationLeadDays"
  ],
  marketplace_economics:[
    "arrivalDate","currency","bookingChannel","marketSegment","reservationCount",
    "netCollectedMinor","platformCommissionMinor","ownerPayableMinor",
    "taxesWithheldMinor","otherDeductionsMinor",
    "platformCommissionRate","ownerPayableRate"
  ],
  city_daily:[
    "countryCode","regionCode","city","date","currency","propertyCount",
    "availableUnitNights","occupiedUnitNights","bookingCount",
    "accommodationRevenueMinor","grossRevenueMinor","netRevenueMinor",
    "occupancy","adrMinor","revparMinor","avgLeadTimeDays","avgStayNights","refreshedAt"
  ],
  country_daily:[
    "countryCode","date","currency","propertyCount",
    "availableUnitNights","occupiedUnitNights","bookingCount",
    "accommodationRevenueMinor","grossRevenueMinor","netRevenueMinor",
    "occupancy","adrMinor","revparMinor","avgLeadTimeDays","avgStayNights","refreshedAt"
  ]
};

@Injectable()
export class AnalyticsExportWorkerService{
  constructor(
    private readonly db:DatabaseService,
    private readonly analytics:AnalyticsQueryService,
    private readonly marketplace:MarketplaceAnalyticsQueryService,
    private readonly storage:AnalyticsExportStorageRegistry
  ){}

  async runCycle(limit=10){
    if(!Number.isInteger(limit)||limit<1||limit>100){
      throw new Error("INVALID_EXPORT_JOB_LIMIT");
    }

    const workerToken="analytics-export:"+randomUUID();
    const claimed=await this.db.query<{
      id:string;organization_id:string;membership_id:string;created_by_user_id:string;
      property_id:string|null;report_type:AnalyticsExportReportType;
      from_date:string;to_date:string;attempt_count:number;
    }>(
      "SELECT * FROM app.claim_analytics_export_jobs($1,$2,$3)",
      [workerToken,limit,LEASE_SECONDS]
    );

    const results:Array<{
      jobId:string;status:"completed"|"retry_scheduled"|"failed";
      contentBytes?:number;errorCode?:string;
    }>=[];

    for(const job of claimed.rows){
      try{
        const actor={
          organizationId:job.organization_id,
          userId:job.created_by_user_id,
          membershipId:job.membership_id,
          requestId:"analytics-export-worker:"+job.id
        };

        const rows=await this.reportRows(actor,job);
        const csv=csvRows(HEADERS[job.report_type],rows);
        const bytes=new TextEncoder().encode(csv);
        if(bytes.byteLength>MAX_EXPORT_BYTES){
          throw new Error("ANALYTICS_EXPORT_TOO_LARGE");
        }

        const checksum=createHash("sha256").update(bytes).digest("hex");
        const provider=this.storage.get();
        const objectKey=[
          "analytics-exports",
          job.organization_id,
          job.id+".csv"
        ].join("/");

        const stored=await provider.putObject({
          objectKey,
          contentType:"text/csv; charset=utf-8",
          body:bytes,
          checksumSha256:checksum
        });
        if(stored.objectKey!==objectKey){
          throw new Error("ANALYTICS_EXPORT_OBJECT_KEY_MISMATCH");
        }

        const completed=await this.db.query<{completed:boolean}>(
          `SELECT app.complete_analytics_export_job(
             $1,$2,$3,$4,$5,$6
           ) AS completed`,
          [
            job.id,workerToken,provider.provider,objectKey,checksum,bytes.byteLength
          ]
        );
        if(completed.rows[0]?.completed!==true){
          throw new Error("ANALYTICS_EXPORT_LEASE_LOST");
        }

        results.push({
          jobId:job.id,
          status:"completed",
          contentBytes:bytes.byteLength
        });
      }catch(error){
        const errorCode=this.errorCode(error);
        const permanent=this.permanentFailure(errorCode);
        const failed=await this.db.query<{failed:boolean}>(
          `SELECT app.fail_analytics_export_job(
             $1,$2,$3,$4
           ) AS failed`,
          [job.id,workerToken,errorCode,permanent]
        ).catch(()=>({rows:[{failed:false}]}));

        results.push({
          jobId:job.id,
          status:permanent||job.attempt_count>=5?"failed":"retry_scheduled",
          errorCode:failed.rows[0]?.failed===true?errorCode:"ANALYTICS_EXPORT_LEASE_LOST"
        });
      }
    }

    return {
      workerToken,
      claimedJobs:claimed.rowCount??0,
      completedJobs:results.filter(x=>x.status==="completed").length,
      retryScheduledJobs:results.filter(x=>x.status==="retry_scheduled").length,
      failedJobs:results.filter(x=>x.status==="failed").length,
      results
    };
  }

  private async reportRows(
    actor:{organizationId:string;userId:string;membershipId:string;requestId:string},
    job:{
      property_id:string|null;report_type:AnalyticsExportReportType;
      from_date:string;to_date:string;
    }
  ):Promise<Array<Record<string,unknown>>>{
    if(job.report_type==="property_daily"){
      if(!job.property_id)throw new Error("ANALYTICS_EXPORT_PROPERTY_REQUIRED");
      return await this.analytics.propertyDailyRollup(
        actor,job.property_id,job.from_date,job.to_date
      ) as Array<Record<string,unknown>>;
    }
    if(job.report_type==="booking_cohorts"){
      if(!job.property_id)throw new Error("ANALYTICS_EXPORT_PROPERTY_REQUIRED");
      return await this.analytics.propertyBookingCohorts(
        actor,job.property_id,job.from_date,job.to_date
      ) as Array<Record<string,unknown>>;
    }
    if(job.report_type==="marketplace_economics"){
      if(!job.property_id)throw new Error("ANALYTICS_EXPORT_PROPERTY_REQUIRED");
      return await this.marketplace.propertyEconomics(
        actor,job.property_id,job.from_date,job.to_date
      ) as Array<Record<string,unknown>>;
    }
    if(job.report_type==="city_daily"){
      return await this.analytics.cityDailyRollup(
        actor,job.from_date,job.to_date
      ) as Array<Record<string,unknown>>;
    }
    if(job.report_type==="country_daily"){
      return await this.analytics.countryDailyRollup(
        actor,job.from_date,job.to_date
      ) as Array<Record<string,unknown>>;
    }
    throw new Error("INVALID_ANALYTICS_EXPORT_REPORT");
  }

  private permanentFailure(errorCode:string){
    return [
      "ANALYTICS_ROLE_FORBIDDEN",
      "PROPERTY_FORBIDDEN",
      "ANALYTICS_EXPORT_PROPERTY_REQUIRED",
      "INVALID_ANALYTICS_EXPORT_REPORT",
      "ANALYTICS_EXPORT_TOO_LARGE"
    ].includes(errorCode);
  }

  private errorCode(error:unknown){
    const raw=error instanceof Error?error.message:"ANALYTICS_EXPORT_ERROR";
    const normalized=raw.toUpperCase().replace(/[^A-Z0-9_:-]+/g,"_").slice(0,120);
    return normalized||"ANALYTICS_EXPORT_ERROR";
  }
}
