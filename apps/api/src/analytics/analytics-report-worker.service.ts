import {createHash,randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";
import {dashboardSummaryCsv} from "./analytics-report-csv";

const LEASE_SECONDS=300;
const MAX_ATTEMPTS=5;

type ClaimedJob={
  job_id:string;
  organization_id:string;
  requested_by_user_id:string;
  membership_id:string;
  property_id:string|null;
  report_kind:"dashboard_summary";
  format:"json"|"csv";
  from_date:string;
  to_date:string;
  attempt_count:number;
};

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
    const claimed=await this.db.query<ClaimedJob>(
      "SELECT * FROM app.claim_analytics_report_jobs($1,$2,$3)",
      [workerToken,limit,LEASE_SECONDS]
    );

    const results:Array<{
      jobId:string;
      status:"completed"|"queued"|"failed"|"lease_lost";
      attemptCount:number;
      errorCode?:string;
    }>=[];

    for(const job of claimed.rows){
      try{
        const actor:RequestActorContext={
          organizationId:job.organization_id,
          userId:job.requested_by_user_id,
          membershipId:job.membership_id,
          requestId:"report-worker:"+job.job_id
        };

        const dashboardResult=await this.dashboard.summary(actor,{
          from:dateText(job.from_date),
          to:dateText(job.to_date),
          propertyId:job.property_id
        }) as Record<string,any>;

        const sourceFingerprint=String(
          dashboardResult.freshness?.sourceFingerprint??""
        );
        if(!/^[a-f0-9]{64}$/.test(sourceFingerprint)){
          throw new Error("INVALID_REPORT_SOURCE_FINGERPRINT");
        }

        const {cache:_cache,...canonicalDashboard}=dashboardResult;
        const generatedAt=new Date().toISOString();
        const snapshot={
          report:{
            schemaVersion:1,
            kind:job.report_kind,
            format:job.format,
            generatedAt
          },
          dashboard:canonicalDashboard
        };

        const contentText=job.format==="json"
          ?JSON.stringify(snapshot,null,2)+"\n"
          :dashboardSummaryCsv(canonicalDashboard);
        const contentType=job.format==="json"
          ?"application/json; charset=utf-8"
          :"text/csv; charset=utf-8";
        const extension=job.format==="json"?"json":"csv";
        const fileName=[
          "views-dashboard",
          dateText(job.from_date),
          dateText(job.to_date),
          job.property_id?"property":"portfolio"
        ].join("-")+"."+extension;
        const contentSha256=sha256(contentText);

        const completed=await this.db.query<{completed:boolean}>(
          `SELECT app.complete_analytics_report_job(
             $1,$2,$3,$4::jsonb,$5,$6,$7,$8
           ) AS completed`,
          [
            job.job_id,workerToken,sourceFingerprint,JSON.stringify(snapshot),
            contentText,contentType,fileName,contentSha256
          ]
        );

        if(completed.rows[0]?.completed!==true){
          results.push({
            jobId:job.job_id,status:"lease_lost",
            attemptCount:Number(job.attempt_count)
          });
          continue;
        }

        results.push({
          jobId:job.job_id,status:"completed",
          attemptCount:Number(job.attempt_count)
        });
      }catch(error){
        const errorCode=normalizeErrorCode(error);
        const failed=await this.db.query<{status:string}>(
          `SELECT app.fail_analytics_report_job(
             $1,$2,$3,$4
           ) AS status`,
          [
            job.job_id,workerToken,errorCode,
            retryableErrorCode(errorCode)?MAX_ATTEMPTS:1
          ]
        );
        const status=failed.rows[0]?.status;
        results.push({
          jobId:job.job_id,
          status:status==="queued"
            ?"queued"
            :status==="failed"
              ?"failed"
              :"lease_lost",
          attemptCount:Number(job.attempt_count),
          errorCode
        });
      }
    }

    return {
      workerToken,
      claimedJobs:claimed.rowCount??0,
      completedJobs:results.filter(x=>x.status==="completed").length,
      queuedForRetry:results.filter(x=>x.status==="queued").length,
      failedJobs:results.filter(x=>x.status==="failed").length,
      leaseLost:results.filter(x=>x.status==="lease_lost").length,
      results
    };
  }
}

function dateText(value:unknown){
  if(typeof value==="string")return value.slice(0,10);
  if(value instanceof Date)return value.toISOString().slice(0,10);
  throw new Error("INVALID_REPORT_DATE");
}

function sha256(value:string){
  return createHash("sha256").update(value).digest("hex");
}

function normalizeErrorCode(error:unknown){
  const raw=error instanceof Error?error.message:"REPORT_WORKER_ERROR";
  if(/^[A-Z][A-Z0-9_:-]{1,119}$/.test(raw))return raw;
  return "REPORT_WORKER_ERROR";
}

function retryableErrorCode(code:string){
  return [
    "REPORT_WORKER_ERROR",
    "ANALYTICS_WORKER_LEASE_LOST",
    "ECONNRESET",
    "ETIMEDOUT"
  ].includes(code);
}
