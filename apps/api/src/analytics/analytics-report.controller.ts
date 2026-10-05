import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,GoneException,
  Headers,NotFoundException,Param,Post,Res,StreamableFile,UnauthorizedException
} from "@nestjs/common";
import type {Response} from "express";
import {requireUuid} from "../identity/actor-context";
import {matchesIfNoneMatch} from "./analytics-dashboard-http";
import {AnalyticsReportService} from "./analytics-report.service";

type ReportBody={
  reportType?:"dashboard_summary";
  format?:"json"|"csv";
  from?:string;
  to?:string;
  propertyId?:string|null;
};

@Controller("v1/analytics/reports")
export class AnalyticsReportController{
  constructor(private readonly reports:AnalyticsReportService){}

  @Post()
  async create(
    @Headers("idempotency-key") idempotencyKey:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Body() body:ReportBody
  ){
    try{
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      if(!body.reportType||!body.format||!body.from||!body.to){
        throw new BadRequestException("Incomplete report request");
      }

      return await this.reports.create(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        {
          reportType:body.reportType,
          format:body.format,
          from:body.from,
          to:body.to,
          propertyId:body.propertyId
            ?requireUuid(body.propertyId,"property_id")
            :null
        },
        idempotencyKey
      );
    }catch(error){throw mapReportError(error)}
  }

  @Get(":id")
  async get(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.reports.get(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"report_job_id")
      );
    }catch(error){throw mapReportError(error)}
  }

  @Get(":id/download")
  async download(
    @Param("id") id:string,
    @Headers("if-none-match") ifNoneMatch:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Res({passthrough:true}) response:Response
  ){
    try{
      const artifact=await this.reports.artifact(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"report_job_id")
      );

      const etag='"views-report-v1-'+artifact.checksumSha256+'"';
      response.setHeader("ETag",etag);
      response.setHeader("Cache-Control","private, no-cache, must-revalidate");

      if(matchesIfNoneMatch(ifNoneMatch,etag)){
        response.status(304);
        return;
      }

      response.setHeader("Content-Type",artifact.contentType);
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="'+safeFilename(artifact.filename)+'"'
      );
      response.setHeader("Content-Length",String(artifact.byteSize));
      response.setHeader("X-Content-SHA256",artifact.checksumSha256);

      return new StreamableFile(artifact.content);
    }catch(error){throw mapReportError(error)}
  }
}

function actorFromHeaders(
  organizationId?:string,userId?:string,membershipId?:string,requestId?:string
){
  try{
    return {
      organizationId:requireUuid(organizationId,"organization_id"),
      userId:requireUuid(userId,"user_id"),
      membershipId:requireUuid(membershipId,"membership_id"),
      requestId:requestId||crypto.randomUUID()
    };
  }catch{throw new UnauthorizedException("valid actor context required")}
}

function safeFilename(value:string){
  return value.replace(/[^A-Za-z0-9._-]+/g,"_").slice(0,180)||"views-report";
}

function mapReportError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException||
    error instanceof NotFoundException||
    error instanceof ConflictException||
    error instanceof GoneException
  )return error;

  const message=error instanceof Error?error.message:"ANALYTICS_REPORT_ERROR";
  if(message==="PROPERTY_FORBIDDEN"||message==="ANALYTICS_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message==="REPORT_JOB_NOT_FOUND")return new NotFoundException(message);
  if(message==="REPORT_NOT_READY")return new ConflictException(message);
  if(message==="REPORT_EXPIRED")return new GoneException(message);
  if(message==="IDEMPOTENCY_CONFLICT")return new ConflictException(message);
  if(
    message.startsWith("INVALID_")||
    message==="ANALYTICS_RANGE_TOO_LARGE"
  )return new BadRequestException(message);
  return new BadRequestException(message);
}
