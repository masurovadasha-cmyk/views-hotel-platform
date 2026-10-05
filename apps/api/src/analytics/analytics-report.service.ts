import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import type {ReportFormat} from "./analytics-report-renderer";

export type CreateAnalyticsReportInput={
  reportType:"dashboard_summary";
  format:ReportFormat;
  from:string;
  to:string;
  propertyId?:string|null;
};

export type AnalyticsReportArtifact={
  format:ReportFormat;
  contentType:string;
  filename:string;
  byteSize:number;
  checksumSha256:string;
  content:Buffer;
  createdAt:string;
  expiresAt:string;
};

@Injectable()
export class AnalyticsReportService{
  constructor(private readonly db:DatabaseService){}

  async create(
    actor:RequestActorContext,
    input:CreateAnalyticsReportInput,
    idempotencyKey:string
  ){
    validateRequest(input,idempotencyKey);
    const normalizedIdempotencyKey=idempotencyKey.trim();
    const normalized={
      reportType:input.reportType,
      format:input.format,
      from:input.from,
      to:input.to,
      propertyId:input.propertyId??null
    };
    const requestHash=hash(JSON.stringify(normalized));

    return this.db.withActor(actor,async client=>{
      const role=(await client.query<{code:string|null}>(
        "SELECT app.current_membership_role() AS code"
      )).rows[0]?.code;
      if(!role||!["host","owner","manager","accountant"].includes(role)){
        throw new Error("ANALYTICS_ROLE_FORBIDDEN");
      }

      if(normalized.propertyId){
        const allowed=(await client.query<{allowed:boolean}>(
          "SELECT app.can_access_property($1::uuid) AS allowed",
          [normalized.propertyId]
        )).rows[0]?.allowed;
        if(!allowed)throw new Error("PROPERTY_FORBIDDEN");
      }

      const inserted=await client.query<{id:string}>(
        `INSERT INTO analytics_report_jobs(
           id,organization_id,property_id,report_type,format,from_date,to_date,
           idempotency_key,request_hash,created_by_user_id,created_by_membership_id
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10
         )
         ON CONFLICT(organization_id,created_by_membership_id,idempotency_key)
         DO NOTHING
         RETURNING id`,
        [
          actor.organizationId,normalized.propertyId,normalized.reportType,normalized.format,
          normalized.from,normalized.to,normalizedIdempotencyKey,requestHash,
          actor.userId,actor.membershipId
        ]
      );

      if(inserted.rows[0]){
        return this.readJob(client,inserted.rows[0].id,false);
      }

      const existing=(await client.query<{id:string;request_hash:string}>(
        `SELECT id,request_hash
           FROM analytics_report_jobs
          WHERE organization_id=$1
            AND created_by_membership_id=$2
            AND idempotency_key=$3`,
        [actor.organizationId,actor.membershipId,normalizedIdempotencyKey]
      )).rows[0];

      if(!existing)throw new Error("IDEMPOTENCY_STATE_MISSING");
      if(existing.request_hash!==requestHash)throw new Error("IDEMPOTENCY_CONFLICT");

      return this.readJob(client,existing.id,true);
    });
  }

  async get(actor:RequestActorContext,jobId:string){
    return this.db.withActor(actor,async client=>{
      const job=await this.readJob(client,jobId,false);
      if(!job)throw new Error("REPORT_JOB_NOT_FOUND");
      return job;
    });
  }

  async artifact(actor:RequestActorContext,jobId:string):Promise<AnalyticsReportArtifact>{
    return this.db.withActor(actor,async client=>{
      const row=(await client.query<{
        job_status:string;format:string;content_type:string;filename:string;
        byte_size:number;checksum_sha256:string;content_bytes:Buffer;created_at:Date;
        artifact_expires_at:Date|null;
      }>(
        `SELECT
           j.status AS job_status,j.artifact_expires_at,
           a.format,a.content_type,a.filename,a.byte_size,
           a.checksum_sha256,a.content_bytes,a.created_at
         FROM analytics_report_jobs j
         LEFT JOIN analytics_report_artifacts a
           ON a.report_job_id=j.id
          AND a.organization_id=j.organization_id
        WHERE j.id=$1`,
        [jobId]
      )).rows[0];

      if(!row)throw new Error("REPORT_JOB_NOT_FOUND");
      if(row.job_status!=="completed")throw new Error("REPORT_NOT_READY");
      if(
        !row.artifact_expires_at||
        row.artifact_expires_at.getTime()<=Date.now()
      )throw new Error("REPORT_EXPIRED");
      if(!row.content_bytes)throw new Error("REPORT_ARTIFACT_MISSING");

      return {
        format:row.format as ReportFormat,
        contentType:row.content_type,
        filename:row.filename,
        byteSize:Number(row.byte_size),
        checksumSha256:row.checksum_sha256,
        content:row.content_bytes,
        createdAt:row.created_at.toISOString(),
        expiresAt:row.artifact_expires_at.toISOString()
      };
    });
  }

  async pruneExpiredArtifacts(limit=1000){
    if(!Number.isInteger(limit)||limit<1||limit>10000){
      throw new Error("INVALID_REPORT_PRUNE_LIMIT");
    }
    const row=(await this.db.query<{pruned:number}>(
      "SELECT app.prune_analytics_report_artifacts($1,now()) AS pruned",
      [limit]
    )).rows[0];
    return {pruned:Number(row?.pruned??0)};
  }

  async recordDownload(
    actor:RequestActorContext,
    jobId:string,
    artifact:Pick<
      AnalyticsReportArtifact,
      "format"|"byteSize"|"checksumSha256"
    >
  ){
    return this.db.withActor(actor,async client=>{
      const visible=(await client.query<{id:string}>(
        `SELECT id
           FROM analytics_report_jobs
          WHERE id=$1
            AND status='completed'`,
        [jobId]
      )).rows[0];
      if(!visible)throw new Error("REPORT_JOB_NOT_FOUND");

      await client.query(
        `INSERT INTO audit_log(
           id,organization_id,actor_user_id,actor_membership_id,request_id,
           action,entity_type,entity_id,after_state
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,
           'analytics.report.download','analytics_report_job',$5,$6::jsonb
         )`,
        [
          actor.organizationId,
          actor.userId,
          actor.membershipId,
          actor.requestId,
          jobId,
          JSON.stringify({
            format:artifact.format,
            byteSize:artifact.byteSize,
            checksumSha256:artifact.checksumSha256
          })
        ]
      );

      return {recorded:true as const};
    });
  }

  private async readJob(
    client:import("pg").PoolClient,
    jobId:string,
    idempotentReplay:boolean
  ){
    const row=(await client.query<{
      id:string;organization_id:string;property_id:string|null;
      report_type:string;format:string;from_date:string;to_date:string;
      status:string;attempt_count:number;max_attempts:number;next_attempt_at:Date;
      last_error_code:string|null;source_fingerprint:string|null;
      created_at:Date;started_at:Date|null;completed_at:Date|null;
      artifact_expires_at:Date|null;
      artifact_id:string|null;filename:string|null;content_type:string|null;
      byte_size:number|null;checksum_sha256:string|null;
    }>(
      `SELECT
         j.id,j.organization_id,j.property_id,j.report_type,j.format,
         j.from_date::text,j.to_date::text,j.status,j.attempt_count,j.max_attempts,
         j.next_attempt_at,j.last_error_code,j.source_fingerprint,
         j.created_at,j.started_at,j.completed_at,j.artifact_expires_at,
         a.id AS artifact_id,a.filename,a.content_type,a.byte_size,a.checksum_sha256
       FROM analytics_report_jobs j
       LEFT JOIN analytics_report_artifacts a
         ON a.report_job_id=j.id
        AND a.organization_id=j.organization_id
       WHERE j.id=$1`,
      [jobId]
    )).rows[0];

    if(!row)return null;

    return {
      reportJobId:row.id,
      organizationId:row.organization_id,
      propertyId:row.property_id,
      reportType:row.report_type,
      format:row.format,
      from:row.from_date,
      to:row.to_date,
      status:row.status,
      attempts:Number(row.attempt_count),
      maxAttempts:Number(row.max_attempts),
      nextAttemptAt:row.next_attempt_at.toISOString(),
      lastErrorCode:row.last_error_code,
      sourceFingerprint:row.source_fingerprint,
      createdAt:row.created_at.toISOString(),
      startedAt:row.started_at?.toISOString()??null,
      completedAt:row.completed_at?.toISOString()??null,
      artifactExpiresAt:row.artifact_expires_at?.toISOString()??null,
      artifact:row.artifact_id?{
        filename:row.filename,
        contentType:row.content_type,
        byteSize:Number(row.byte_size),
        checksumSha256:row.checksum_sha256
      }:null,
      idempotentReplay
    };
  }
}

function validateRequest(
  input:CreateAnalyticsReportInput,
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

  const start=parseDate(input.from),end=parseDate(input.to);
  if(start===null||end===null)throw new Error("INVALID_ANALYTICS_DATE");
  if(start>end)throw new Error("INVALID_ANALYTICS_RANGE");
  const days=Math.floor((end-start)/86400000)+1;
  if(days>366)throw new Error("ANALYTICS_RANGE_TOO_LARGE");
}

function parseDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,day]=value.split("-").map(Number);
  const ms=Date.UTC(year,month-1,day);
  const d=new Date(ms);
  if(
    d.getUTCFullYear()!==year||
    d.getUTCMonth()!==month-1||
    d.getUTCDate()!==day
  )return null;
  return ms;
}

function hash(value:string){
  return createHash("sha256").update(value).digest("hex");
}
