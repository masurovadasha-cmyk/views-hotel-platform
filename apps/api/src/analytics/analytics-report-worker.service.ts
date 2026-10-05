import {randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";
import {renderDashboardReport,type ReportFormat} from "./analytics-report-renderer";

const LEASE_SECONDS=300;

@Injectable()
export class AnalyticsReportWorkerService{
  constructor(
    private readonly db:DatabaseService,
    private readonly dashboard:AnalyticsDashboardService
  ){}

  async runCycle(limit=20){
    if(!Number.isInteger(limit)||limit<1||limit>100){
      throw new Error("INVALID_REPORT_JOB_LIMIT");
    }

    const workerToken="analytics-report-worker:"+randomUUID();
    const claimed=await this.db.query<{
      job_id:string;organization_id:string;property_id:string|null;
      report_type:string;format:ReportFormat;from_date:Date;to_date:Date;
      created_by_user_id:string;created_by_membership_id:string;attempt_count:number;
    }>(
      "SELECT * FROM app.claim_analytics_report_jobs($1,$2,$3)",
      [workerToken,limit,LEASE_SECONDS]
    );

    const results:Array<{
      reportJobId:string;
      status:"completed"|"queued"|"failed";
      attempts:number;
      errorCode?:string;
    }>=[];

    for(const job of claimed.rows){
      try{
        if(job.report_type!=="dashboard_summary"){
          throw new Error("UNSUPPORTED_REPORT_TYPE");
        }

        const actor={
          organizationId:job.organization_id,
          userId:job.created_by_user_id,
          membershipId:job.created_by_membership_id,
          requestId:"report-job:"+job.job_id
        };

        const summary=await this.dashboard.summary(actor,{
          from:dateText(job.from_date),
          to:dateText(job.to_date),
          propertyId:job.property_id
        }) as Record<string,unknown>;

        const sourceFingerprint=String(
          (summary.freshness as {sourceFingerprint?:string}|undefined)
            ?.sourceFingerprint??""
        );

        const rendered=renderDashboardReport(summary,job.format);
        const filename=reportFilename(
          job.job_id,dateText(job.from_date),dateText(job.to_date),
          job.property_id,rendered.extension
        );

        const completed=await this.db.query<{completed:boolean}>(
          `SELECT app.complete_analytics_report_job(
             $1,$2,$3,$4,$5,$6,$7
           ) AS completed`,
          [
            job.job_id,workerToken,sourceFingerprint,
            rendered.contentType,filename,rendered.checksumSha256,rendered.content
          ]
        );

        if(completed.rows[0]?.completed!==true){
          throw new Error("REPORT_WORKER_LEASE_LOST");
        }

        results.push({
          reportJobId:job.job_id,
          status:"completed",
          attempts:Number(job.attempt_count)
        });
      }catch(error){
        const errorCode=normalizeError(error);
        const failed=await this.db.query<{status:string|null}>(
          "SELECT app.fail_analytics_report_job($1,$2,$3) AS status",
          [job.job_id,workerToken,errorCode]
        );
        const status=failed.rows[0]?.status;
        results.push({
          reportJobId:job.job_id,
          status:status==="failed"?"failed":"queued",
          attempts:Number(job.attempt_count),
          errorCode
        });
      }
    }

    return {
      workerToken,
      claimed:claimed.rowCount??0,
      completed:results.filter(x=>x.status==="completed").length,
      queuedForRetry:results.filter(x=>x.status==="queued").length,
      failed:results.filter(x=>x.status==="failed").length,
      results
    };
  }
}

function dateText(value:Date|string){
  if(typeof value==="string")return value.slice(0,10);
  return value.toISOString().slice(0,10);
}

function reportFilename(
  jobId:string,
  from:string,
  to:string,
  propertyId:string|null,
  extension:string
){
  const scope=propertyId?"property-"+propertyId.slice(0,8):"organization";
  return "views-dashboard-"+scope+"-"+from+"-"+to+"-"+jobId.slice(0,8)+"."+extension;
}

function normalizeError(error:unknown){
  const raw=error instanceof Error?error.message:"REPORT_JOB_ERROR";
  const normalized=raw.toUpperCase().replace(/[^A-Z0-9_:-]+/g,"_").slice(0,120);
  return normalized||"REPORT_JOB_ERROR";
}
