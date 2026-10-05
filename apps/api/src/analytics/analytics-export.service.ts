import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {AnalyticsExportStorageRegistry} from "./analytics-export-storage.registry";

export const analyticsExportReportTypes=[
  "property_daily",
  "booking_cohorts",
  "marketplace_economics",
  "city_daily",
  "country_daily"
] as const;

export type AnalyticsExportReportType=typeof analyticsExportReportTypes[number];

@Injectable()
export class AnalyticsExportService{
  constructor(
    private readonly db:DatabaseService,
    private readonly storage:AnalyticsExportStorageRegistry
  ){}

  async create(
    actor:RequestActorContext,
    input:{
      reportType:AnalyticsExportReportType;
      from:string;
      to:string;
      propertyId?:string|null;
    },
    idempotencyKey:string
  ){
    this.validateInput(input,idempotencyKey);
    const requestHash=this.hash({
      reportType:input.reportType,
      format:"csv",
      from:input.from,
      to:input.to,
      propertyId:input.propertyId??null
    });

    return this.db.withActor(actor,async client=>{
      await this.assertRole(client);
      await this.assertReportScope(client,input.reportType,input.propertyId??null);

      const inserted=await client.query<{
        id:string;status:string;created_at:Date;
      }>(
        `INSERT INTO analytics_export_jobs(
           id,organization_id,membership_id,created_by_user_id,property_id,
           report_type,format,from_date,to_date,idempotency_key,request_hash
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,$5,'csv',$6::date,$7::date,$8,$9
         )
         ON CONFLICT(organization_id,membership_id,idempotency_key) DO NOTHING
         RETURNING id,status,created_at`,
        [
          actor.organizationId,actor.membershipId,actor.userId,input.propertyId??null,
          input.reportType,input.from,input.to,idempotencyKey,requestHash
        ]
      );

      if(inserted.rows[0]){
        return {
          jobId:inserted.rows[0].id,
          status:inserted.rows[0].status,
          createdAt:inserted.rows[0].created_at.toISOString(),
          idempotentReplay:false
        };
      }

      const existing=(await client.query<{
        id:string;status:string;created_at:Date;request_hash:string;
      }>(
        `SELECT id,status,created_at,request_hash
           FROM analytics_export_jobs
          WHERE organization_id=$1
            AND membership_id=$2
            AND idempotency_key=$3`,
        [actor.organizationId,actor.membershipId,idempotencyKey]
      )).rows[0];

      if(!existing)throw new Error("ANALYTICS_EXPORT_IDEMPOTENCY_STATE_MISSING");
      if(existing.request_hash!==requestHash){
        throw new Error("ANALYTICS_EXPORT_IDEMPOTENCY_CONFLICT");
      }

      return {
        jobId:existing.id,
        status:existing.status,
        createdAt:existing.created_at.toISOString(),
        idempotentReplay:true
      };
    });
  }

  async get(actor:RequestActorContext,jobId:string){
    return this.db.withActor(actor,async client=>{
      await this.assertRole(client);
      const row=(await client.query<{
        id:string;property_id:string|null;report_type:AnalyticsExportReportType;
        format:string;status:string;from_date:string;to_date:string;
        storage_provider:string|null;object_key:string|null;
        content_sha256:string|null;content_bytes:string|null;
        attempt_count:number;last_error_code:string|null;
        created_at:Date;completed_at:Date|null;cancelled_at:Date|null;
      }>(
        `SELECT
           id,property_id,report_type,format,status,
           from_date::text,to_date::text,storage_provider,object_key,
           content_sha256,content_bytes::text,attempt_count,last_error_code,
           created_at,completed_at,cancelled_at
         FROM analytics_export_jobs
        WHERE id=$1`,
        [jobId]
      )).rows[0];
      if(!row)throw new Error("ANALYTICS_EXPORT_NOT_FOUND");

      return {
        jobId:row.id,
        propertyId:row.property_id,
        reportType:row.report_type,
        format:row.format,
        status:row.status,
        period:{from:row.from_date,to:row.to_date},
        storageProvider:row.storage_provider,
        contentSha256:row.content_sha256,
        contentBytes:row.content_bytes,
        attemptCount:row.attempt_count,
        lastErrorCode:row.last_error_code,
        createdAt:row.created_at.toISOString(),
        completedAt:row.completed_at?.toISOString()??null,
        cancelledAt:row.cancelled_at?.toISOString()??null
      };
    });
  }

  async cancel(actor:RequestActorContext,jobId:string){
    return this.db.withActor(actor,async client=>{
      await this.assertRole(client);
      const row=(await client.query<{status:string;cancelled_at:Date|null}>(
        `UPDATE analytics_export_jobs
            SET status='cancelled',
                cancelled_at=now(),
                lease_token=NULL,
                lease_until=NULL,
                updated_at=now()
          WHERE id=$1
            AND status='pending'
          RETURNING status,cancelled_at`,
        [jobId]
      )).rows[0];

      if(row){
        return {
          jobId,
          status:row.status,
          cancelledAt:row.cancelled_at?.toISOString()??null
        };
      }

      const existing=(await client.query<{status:string}>(
        "SELECT status FROM analytics_export_jobs WHERE id=$1",
        [jobId]
      )).rows[0];
      if(!existing)throw new Error("ANALYTICS_EXPORT_NOT_FOUND");
      throw new Error("ANALYTICS_EXPORT_NOT_CANCELLABLE");
    });
  }

  async download(actor:RequestActorContext,jobId:string){
    return this.db.withActor(actor,async client=>{
      await this.assertRole(client);
      const row=(await client.query<{
        status:string;storage_provider:string|null;object_key:string|null;
      }>(
        `SELECT status,storage_provider,object_key
           FROM analytics_export_jobs
          WHERE id=$1`,
        [jobId]
      )).rows[0];
      if(!row)throw new Error("ANALYTICS_EXPORT_NOT_FOUND");
      if(row.status!=="completed"||!row.object_key||!row.storage_provider){
        throw new Error("ANALYTICS_EXPORT_NOT_READY");
      }

      const provider=this.storage.get(row.storage_provider);
      const result=await provider.createDownloadUrl({
        objectKey:row.object_key,
        expiresInSeconds:900
      });
      if(!/^https:\/\//i.test(result.url)){
        throw new Error("ANALYTICS_EXPORT_INVALID_DOWNLOAD_URL");
      }

      return {
        jobId,
        url:result.url,
        expiresAt:result.expiresAt
      };
    });
  }

  connectedStorageProviders(){
    return this.storage.connected();
  }

  private validateInput(
    input:{
      reportType:AnalyticsExportReportType;
      from:string;
      to:string;
      propertyId?:string|null;
    },
    idempotencyKey:string
  ){
    if(!analyticsExportReportTypes.includes(input.reportType)){
      throw new Error("INVALID_ANALYTICS_EXPORT_REPORT");
    }
    if(!idempotencyKey.trim()||idempotencyKey.length>160){
      throw new Error("INVALID_IDEMPOTENCY_KEY");
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.from)||!/^\d{4}-\d{2}-\d{2}$/.test(input.to)){
      throw new Error("INVALID_ANALYTICS_DATE");
    }
    if(input.from>input.to)throw new Error("INVALID_ANALYTICS_RANGE");

    const start=Date.parse(input.from+"T00:00:00Z");
    const end=Date.parse(input.to+"T00:00:00Z");
    const days=Math.floor((end-start)/86400000)+1;
    if(days<1||days>366)throw new Error("ANALYTICS_RANGE_TOO_LARGE");

    const propertyReport=this.requiresProperty(input.reportType);
    if(propertyReport&&!input.propertyId){
      throw new Error("ANALYTICS_EXPORT_PROPERTY_REQUIRED");
    }
    if(!propertyReport&&input.propertyId){
      throw new Error("ANALYTICS_EXPORT_PROPERTY_NOT_ALLOWED");
    }
  }

  private async assertReportScope(
    client:import("pg").PoolClient,
    reportType:AnalyticsExportReportType,
    propertyId:string|null
  ){
    if(!this.requiresProperty(reportType))return;
    if(!propertyId)throw new Error("ANALYTICS_EXPORT_PROPERTY_REQUIRED");
    const allowed=(await client.query<{allowed:boolean}>(
      "SELECT app.can_access_property($1::uuid) AS allowed",
      [propertyId]
    )).rows[0]?.allowed;
    if(!allowed)throw new Error("PROPERTY_FORBIDDEN");
  }

  private requiresProperty(reportType:AnalyticsExportReportType){
    return [
      "property_daily",
      "booking_cohorts",
      "marketplace_economics"
    ].includes(reportType);
  }

  private async assertRole(client:import("pg").PoolClient){
    const role=(await client.query<{code:string|null}>(
      "SELECT app.current_membership_role() AS code"
    )).rows[0]?.code;
    if(!role||!["host","owner","manager","accountant"].includes(role)){
      throw new Error("ANALYTICS_ROLE_FORBIDDEN");
    }
  }

  private hash(value:unknown){
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}
