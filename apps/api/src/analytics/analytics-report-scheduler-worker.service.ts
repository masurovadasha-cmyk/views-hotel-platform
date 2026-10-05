import {randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {AnalyticsReportService} from "./analytics-report.service";

const LEASE_SECONDS=300;

@Injectable()
export class AnalyticsReportSchedulerWorkerService{
  constructor(
    private readonly db:DatabaseService,
    private readonly reports:AnalyticsReportService
  ){}

  async runCycle(limit=20,now=new Date()){
    if(!Number.isInteger(limit)||limit<1||limit>100){
      throw new Error("INVALID_REPORT_SCHEDULE_LIMIT");
    }

    const workerToken="analytics-report-scheduler:"+randomUUID();
    const claimed=await this.db.query<{
      schedule_id:string;organization_id:string;property_id:string|null;
      report_type:"dashboard_summary";format:"json"|"csv";timezone:string;
      scheduled_for:Date;from_date:Date|string;to_date:Date|string;
      created_by_user_id:string;created_by_membership_id:string;
      consecutive_failures:number;
    }>(
      "SELECT * FROM app.claim_due_analytics_report_schedules($1,$2,$3,$4)",
      [workerToken,limit,LEASE_SECONDS,now]
    );

    const results:Array<{
      reportScheduleId:string;
      status:"enqueued"|"retry"|"paused";
      reportJobId?:string;
      scheduledFor:string;
      nextRunAt?:string;
      errorCode?:string;
    }>=[];

    for(const schedule of claimed.rows){
      const scheduledFor=schedule.scheduled_for.toISOString();
      try{
        const actor={
          organizationId:schedule.organization_id,
          userId:schedule.created_by_user_id,
          membershipId:schedule.created_by_membership_id,
          requestId:"report-schedule:"+schedule.schedule_id+":"+scheduledFor
        };
        const idempotencyKey=
          "schedule:"+schedule.schedule_id+":"+scheduledFor;

        const report=await this.reports.create(actor,{
          reportType:schedule.report_type,
          format:schedule.format,
          from:dateText(schedule.from_date),
          to:dateText(schedule.to_date),
          propertyId:schedule.property_id
        },idempotencyKey);

        if(!report)throw new Error("REPORT_SCHEDULE_JOB_MISSING");

        const completed=await this.db.query<{next_run_at:Date|null}>(
          `SELECT app.complete_analytics_report_schedule(
             $1,$2,$3
           ) AS next_run_at`,
          [schedule.schedule_id,workerToken,schedule.scheduled_for,report.reportJobId]
        );
        const nextRun=completed.rows[0]?.next_run_at;
        if(!nextRun)throw new Error("REPORT_SCHEDULE_LEASE_LOST");

        results.push({
          reportScheduleId:schedule.schedule_id,
          status:"enqueued",
          reportJobId:report.reportJobId,
          scheduledFor,
          nextRunAt:nextRun.toISOString()
        });
      }catch(error){
        const errorCode=normalizeError(error);
        const failed=await this.db.query<{status:string|null}>(
          `SELECT app.fail_analytics_report_schedule(
             $1,$2,$3,$4
           ) AS status`,
          [schedule.schedule_id,workerToken,errorCode,now]
        );
        results.push({
          reportScheduleId:schedule.schedule_id,
          status:failed.rows[0]?.status==="paused"?"paused":"retry",
          scheduledFor,
          errorCode
        });
      }
    }

    return {
      workerToken,
      claimed:claimed.rowCount??0,
      enqueued:results.filter(x=>x.status==="enqueued").length,
      retry:results.filter(x=>x.status==="retry").length,
      paused:results.filter(x=>x.status==="paused").length,
      results
    };
  }
}

function dateText(value:Date|string){
  if(typeof value==="string")return value.slice(0,10);
  return value.toISOString().slice(0,10);
}

function normalizeError(error:unknown){
  const raw=error instanceof Error?error.message:"REPORT_SCHEDULE_ERROR";
  const normalized=raw.toUpperCase().replace(/[^A-Z0-9_:-]+/g,"_").slice(0,120);
  return normalized||"REPORT_SCHEDULE_ERROR";
}
