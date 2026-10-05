import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

export type AnalyticsReportFormat="json"|"csv";

export type CreateAnalyticsReportInput={
  from:string;
  to:string;
  propertyId?:string|null;
  format:AnalyticsReportFormat;
};

type ReportRow={
  id:string;
  report_kind:string;
  format:AnalyticsReportFormat;
  property_id:string|null;
  from_date:string;
  to_date:string;
  status:string;
  attempt_count:number;
  source_fingerprint:string|null;
  content_type:string|null;
  file_name:string|null;
  content_sha256:string|null;
  last_error_code:string|null;
  created_at:Date;
  started_at:Date|null;
  completed_at:Date|null;
  expires_at:Date|null;
};

@Injectable()
export class AnalyticsReportService{
  constructor(private readonly db:DatabaseService){}

  async create(
    actor:RequestActorContext,
    input:CreateAnalyticsReportInput,
    idempotencyKey:string
  ){
    validateIdempotencyKey(idempotencyKey);
    const normalizedIdempotencyKey=idempotencyKey.trim();
    validateDateRange(input.from,input.to);
    if(!["json","csv"].includes(input.format)){
      throw new Error("INVALID_REPORT_FORMAT");
    }

    const normalized={
      reportKind:"dashboard_summary" as const,
      format:input.format,
      propertyId:input.propertyId??null,
      from:input.from,
      to:input.to,
      reportSchemaVersion:1
    };
    const inputHash=sha256(JSON.stringify(normalized));

    return this.db.withActor(actor,async client=>{
      await assertReportAccess(client,normalized.propertyId);

      const inserted=await client.query<{id:string}>(
        `INSERT INTO analytics_report_jobs(
           id,organization_id,requested_by_user_id,membership_id,property_id,
           report_kind,format,from_date,to_date,report_schema_version,
           idempotency_key,input_hash,status
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,'dashboard_summary',$5,$6::date,$7::date,1,
           $8,$9,'queued'
         )
         ON CONFLICT(organization_id,membership_id,idempotency_key)
         DO NOTHING
         RETURNING id`,
        [
          actor.organizationId,actor.userId,actor.membershipId,
          normalized.propertyId,normalized.format,normalized.from,normalized.to,
          normalizedIdempotencyKey,inputHash
        ]
      );

      if(inserted.rows[0]){
        const row=await this.readRow(client,inserted.rows[0].id);
        return {...serializeRow(row),idempotentReplay:false};
      }

      const existing=(await client.query<ReportRow & {input_hash:string}>(
        `SELECT
           id,report_kind,format,property_id,
           from_date::text,to_date::text,status,attempt_count,
           source_fingerprint,content_type,file_name,content_sha256,last_error_code,
           created_at,started_at,completed_at,expires_at,input_hash
         FROM analytics_report_jobs
        WHERE organization_id=$1
          AND membership_id=$2
          AND idempotency_key=$3`,
        [actor.organizationId,actor.membershipId,normalizedIdempotencyKey]
      )).rows[0];

      if(!existing)throw new Error("REPORT_IDEMPOTENCY_STATE_MISSING");
      if(existing.input_hash!==inputHash)throw new Error("REPORT_IDEMPOTENCY_CONFLICT");
      return {...serializeRow(existing),idempotentReplay:true};
    });
  }

  async get(actor:RequestActorContext,jobId:string){
    return this.db.withActor(actor,async client=>{
      const row=await this.readRow(client,jobId);
      if(!row)throw new Error("REPORT_JOB_NOT_FOUND");
      return serializeRow(row);
    });
  }

  async content(actor:RequestActorContext,jobId:string){
    return this.db.withActor(actor,async client=>{
      const row=(await client.query<{
        id:string;format:AnalyticsReportFormat;status:string;
        content_text:string|null;content_type:string|null;file_name:string|null;
        content_sha256:string|null;expires_at:Date|null;
      }>(
        `SELECT id,format,status,content_text,content_type,file_name,content_sha256,expires_at
         FROM analytics_report_jobs
        WHERE id=$1
          AND organization_id=$2
          AND membership_id=$3`,
        [jobId,actor.organizationId,actor.membershipId]
      )).rows[0];

      if(!row)throw new Error("REPORT_JOB_NOT_FOUND");
      if(row.status!=="completed")throw new Error("REPORT_NOT_READY");
      if(!row.expires_at||row.expires_at.getTime()<=Date.now()){
        throw new Error("REPORT_EXPIRED");
      }
      if(
        row.content_text===null||
        row.content_type===null||
        row.file_name===null||
        row.content_sha256===null
      )throw new Error("REPORT_CONTENT_MISSING");

      return {
        jobId:row.id,
        format:row.format,
        content:row.content_text,
        contentType:row.content_type,
        fileName:row.file_name,
        contentSha256:row.content_sha256,
        expiresAt:row.expires_at.toISOString()
      };
    });
  }

  private async readRow(client:PoolClient,jobId:string){
    return (await client.query<ReportRow>(
      `SELECT
         id,report_kind,format,property_id,
         from_date::text,to_date::text,status,attempt_count,
         source_fingerprint,content_type,file_name,content_sha256,last_error_code,
         created_at,started_at,completed_at,expires_at
       FROM analytics_report_jobs
      WHERE id=$1`,
      [jobId]
    )).rows[0];
  }
}

async function assertReportAccess(client:PoolClient,propertyId:string|null){
  const role=(await client.query<{code:string|null}>(
    "SELECT app.current_membership_role() AS code"
  )).rows[0]?.code;
  if(!role||!["host","owner","manager","accountant"].includes(role)){
    throw new Error("ANALYTICS_ROLE_FORBIDDEN");
  }

  if(propertyId){
    const allowed=(await client.query<{allowed:boolean}>(
      "SELECT app.can_access_property($1::uuid) AS allowed",
      [propertyId]
    )).rows[0]?.allowed;
    if(!allowed)throw new Error("PROPERTY_FORBIDDEN");
  }
}

function serializeRow(row:ReportRow|undefined){
  if(!row)throw new Error("REPORT_JOB_NOT_FOUND");
  return {
    jobId:row.id,
    reportKind:row.report_kind,
    format:row.format,
    propertyId:row.property_id,
    from:row.from_date,
    to:row.to_date,
    status:row.status,
    attemptCount:Number(row.attempt_count),
    sourceFingerprint:row.source_fingerprint,
    contentType:row.content_type,
    fileName:row.file_name,
    contentSha256:row.content_sha256,
    lastErrorCode:row.last_error_code,
    createdAt:row.created_at.toISOString(),
    startedAt:row.started_at?.toISOString()??null,
    completedAt:row.completed_at?.toISOString()??null,
    expiresAt:row.expires_at?.toISOString()??null
  };
}

function validateIdempotencyKey(value:string){
  const key=String(value||"").trim();
  if(!key||key.length>160)throw new Error("INVALID_IDEMPOTENCY_KEY");
}

function validateDateRange(from:string,to:string){
  const start=parseDate(from),end=parseDate(to);
  if(start===null||end===null)throw new Error("INVALID_ANALYTICS_DATE");
  if(start>end)throw new Error("INVALID_ANALYTICS_RANGE");
  const days=Math.floor((end-start)/86400000)+1;
  if(days>366)throw new Error("ANALYTICS_RANGE_TOO_LARGE");
}

function parseDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,day]=value.split("-").map(Number);
  const ms=Date.UTC(year,month-1,day);
  const date=new Date(ms);
  if(
    date.getUTCFullYear()!==year||
    date.getUTCMonth()!==month-1||
    date.getUTCDate()!==day
  )return null;
  return ms;
}

function sha256(value:string){
  return createHash("sha256").update(value).digest("hex");
}
