import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

export type ReportScheduleCadence="daily"|"weekly"|"monthly";
export type ReportSchedulePeriod="previous_day"|"previous_7_days"|"previous_month";

export type CreateReportScheduleInput={
  reportType:"dashboard_summary";
  format:"json"|"csv";
  cadence:ReportScheduleCadence;
  periodKind:ReportSchedulePeriod;
  localTime:string;
  isoWeekday?:number|null;
  dayOfMonth?:number|null;
  propertyId?:string|null;
};

@Injectable()
export class AnalyticsReportScheduleService{
  constructor(private readonly db:DatabaseService){}

  async create(
    actor:RequestActorContext,
    input:CreateReportScheduleInput,
    idempotencyKey:string
  ){
    validateSchedule(input,idempotencyKey);

    return this.db.withActor(actor,async client=>{
      await assertScheduleRole(client);

      const timezone=input.propertyId
        ?await propertyTimezone(
          client,actor.organizationId,input.propertyId
        )
        :await organizationTimezone(client,actor.organizationId);

      const normalized={
        reportType:input.reportType,
        format:input.format,
        cadence:input.cadence,
        periodKind:input.periodKind,
        localTime:input.localTime,
        isoWeekday:input.isoWeekday??null,
        dayOfMonth:input.dayOfMonth??null,
        propertyId:input.propertyId??null,
        timezone
      };
      const requestHash=hash(JSON.stringify(normalized));

      const inserted=await client.query<{id:string}>(
        `INSERT INTO analytics_report_schedules(
           id,organization_id,property_id,report_type,format,
           cadence,period_kind,timezone,local_time,iso_weekday,day_of_month,
           idempotency_key,request_hash,created_by_user_id,created_by_membership_id,
           next_run_at,next_attempt_at
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8::time,$9,$10,
           $11,$12,$13,$14,
           app.next_analytics_report_schedule_run(
             $5,$7,$8::time,$9,$10,now()
           ),
           app.next_analytics_report_schedule_run(
             $5,$7,$8::time,$9,$10,now()
           )
         )
         ON CONFLICT(
           organization_id,created_by_membership_id,idempotency_key
         ) DO NOTHING
         RETURNING id`,
        [
          actor.organizationId,normalized.propertyId,
          normalized.reportType,normalized.format,
          normalized.cadence,normalized.periodKind,normalized.timezone,
          normalized.localTime,normalized.isoWeekday,normalized.dayOfMonth,
          idempotencyKey,requestHash,actor.userId,actor.membershipId
        ]
      );

      if(inserted.rows[0]){
        return this.read(client,inserted.rows[0].id,false);
      }

      const existing=(await client.query<{id:string;request_hash:string}>(
        `SELECT id,request_hash
           FROM analytics_report_schedules
          WHERE organization_id=$1
            AND created_by_membership_id=$2
            AND idempotency_key=$3`,
        [actor.organizationId,actor.membershipId,idempotencyKey]
      )).rows[0];

      if(!existing)throw new Error("IDEMPOTENCY_STATE_MISSING");
      if(existing.request_hash!==requestHash)throw new Error("IDEMPOTENCY_CONFLICT");

      return this.read(client,existing.id,true);
    });
  }

  async get(actor:RequestActorContext,scheduleId:string){
    return this.db.withActor(actor,async client=>{
      const schedule=await this.read(client,scheduleId,false);
      if(!schedule)throw new Error("REPORT_SCHEDULE_NOT_FOUND");
      return schedule;
    });
  }

  async list(actor:RequestActorContext){
    return this.db.withActor(actor,async client=>{
      await assertScheduleRole(client);
      const rows=await client.query<{id:string}>(
        `SELECT id
           FROM analytics_report_schedules
          WHERE organization_id=$1
          ORDER BY created_at DESC,id DESC
          LIMIT 200`,
        [actor.organizationId]
      );

      const result=[];
      for(const row of rows.rows){
        const schedule=await this.read(client,row.id,false);
        if(schedule)result.push(schedule);
      }
      return result;
    });
  }

  async pause(actor:RequestActorContext,scheduleId:string){
    return this.db.withActor(actor,async client=>{
      await assertScheduleRole(client);
      const paused=(await client.query<{paused:boolean}>(
        "SELECT app.pause_analytics_report_schedule($1) AS paused",
        [scheduleId]
      )).rows[0]?.paused;
      if(!paused)throw new Error("REPORT_SCHEDULE_NOT_FOUND");

      const result=await this.read(client,scheduleId,false);
      if(!result)throw new Error("REPORT_SCHEDULE_NOT_FOUND");
      return result;
    });
  }

  async resume(actor:RequestActorContext,scheduleId:string){
    return this.db.withActor(actor,async client=>{
      await assertScheduleRole(client);
      const row=(await client.query<{next_run_at:Date|null}>(
        "SELECT app.resume_analytics_report_schedule($1,now()) AS next_run_at",
        [scheduleId]
      )).rows[0];
      if(!row?.next_run_at)throw new Error("REPORT_SCHEDULE_NOT_FOUND");

      const result=await this.read(client,scheduleId,false);
      if(!result)throw new Error("REPORT_SCHEDULE_NOT_FOUND");
      return result;
    });
  }

  private async read(
    client:import("pg").PoolClient,
    scheduleId:string,
    idempotentReplay:boolean
  ){
    const row=(await client.query<{
      id:string;organization_id:string;property_id:string|null;
      report_type:string;format:string;cadence:string;period_kind:string;
      timezone:string;local_time:string;iso_weekday:number|null;day_of_month:number|null;
      status:string;next_run_at:Date;next_attempt_at:Date;
      consecutive_failures:number;max_failures:number;last_error_code:string|null;
      last_enqueued_at:Date|null;created_at:Date;updated_at:Date;
    }>(
      `SELECT
         id,organization_id,property_id,report_type,format,cadence,period_kind,
         timezone,to_char(local_time,'HH24:MI') AS local_time,
         iso_weekday,day_of_month,status,next_run_at,next_attempt_at,
         consecutive_failures,max_failures,last_error_code,last_enqueued_at,
         created_at,updated_at
       FROM analytics_report_schedules
       WHERE id=$1`,
      [scheduleId]
    )).rows[0];

    if(!row)return null;

    return {
      reportScheduleId:row.id,
      organizationId:row.organization_id,
      propertyId:row.property_id,
      reportType:row.report_type,
      format:row.format,
      cadence:row.cadence,
      periodKind:row.period_kind,
      timezone:row.timezone,
      localTime:row.local_time,
      isoWeekday:row.iso_weekday,
      dayOfMonth:row.day_of_month,
      status:row.status,
      nextRunAt:row.next_run_at.toISOString(),
      nextAttemptAt:row.next_attempt_at.toISOString(),
      consecutiveFailures:Number(row.consecutive_failures),
      maxFailures:Number(row.max_failures),
      lastErrorCode:row.last_error_code,
      lastEnqueuedAt:row.last_enqueued_at?.toISOString()??null,
      createdAt:row.created_at.toISOString(),
      updatedAt:row.updated_at.toISOString(),
      idempotentReplay
    };
  }
}

function validateSchedule(
  input:CreateReportScheduleInput,
  idempotencyKey:string
){
  if(!idempotencyKey.trim()||idempotencyKey.length>160){
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
  if(input.reportType!=="dashboard_summary"){
    throw new Error("INVALID_REPORT_TYPE");
  }
  if(!["json","csv"].includes(input.format)){
    throw new Error("INVALID_REPORT_FORMAT");
  }
  if(!["daily","weekly","monthly"].includes(input.cadence)){
    throw new Error("INVALID_REPORT_SCHEDULE_CADENCE");
  }
  if(!["previous_day","previous_7_days","previous_month"].includes(input.periodKind)){
    throw new Error("INVALID_REPORT_PERIOD_KIND");
  }
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.localTime)){
    throw new Error("INVALID_REPORT_SCHEDULE_TIME");
  }

  const weekday=input.isoWeekday??null;
  const dayOfMonth=input.dayOfMonth??null;

  if(input.cadence==="daily"&&(weekday!==null||dayOfMonth!==null)){
    throw new Error("INVALID_DAILY_REPORT_SCHEDULE");
  }
  const validWeekday=
    typeof weekday==="number"&&Number.isInteger(weekday)&&weekday>=1&&weekday<=7;
  const validDayOfMonth=
    typeof dayOfMonth==="number"&&Number.isInteger(dayOfMonth)&&
    dayOfMonth>=1&&dayOfMonth<=28;

  if(
    input.cadence==="weekly"&&
    (!validWeekday||dayOfMonth!==null)
  ){
    throw new Error("INVALID_WEEKLY_REPORT_SCHEDULE");
  }
  if(
    input.cadence==="monthly"&&
    (!validDayOfMonth||weekday!==null)
  ){
    throw new Error("INVALID_MONTHLY_REPORT_SCHEDULE");
  }
}

async function assertScheduleRole(client:import("pg").PoolClient){
  const role=(await client.query<{code:string|null}>(
    "SELECT app.current_membership_role() AS code"
  )).rows[0]?.code;
  if(!role||!["host","owner","manager","accountant"].includes(role)){
    throw new Error("ANALYTICS_ROLE_FORBIDDEN");
  }
}

async function propertyTimezone(
  client:import("pg").PoolClient,
  organizationId:string,
  propertyId:string
){
  const row=(await client.query<{timezone:string}>(
    `SELECT timezone
       FROM properties
      WHERE id=$1
        AND organization_id=$2
        AND app.can_access_property(id)`,
    [propertyId,organizationId]
  )).rows[0];
  if(!row)throw new Error("PROPERTY_FORBIDDEN");
  return row.timezone;
}

async function organizationTimezone(
  client:import("pg").PoolClient,
  organizationId:string
){
  const row=(await client.query<{timezone:string}>(
    "SELECT timezone FROM organizations WHERE id=$1",
    [organizationId]
  )).rows[0];
  if(!row)throw new Error("ORGANIZATION_NOT_FOUND");
  return row.timezone;
}

function hash(value:string){
  return createHash("sha256").update(value).digest("hex");
}
