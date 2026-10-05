import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,
  Get,GoneException,Headers,NotFoundException,Param,Post,Res,UnauthorizedException
} from "@nestjs/common";
import type {Response} from "express";
import {requireUuid} from "../identity/actor-context";
import {matchesIfNoneMatch} from "./analytics-dashboard-http";
import {
  AnalyticsReportService,type AnalyticsReportFormat
} from "./analytics-report.service";

@Controller("v1/analytics/reports")
export class AnalyticsReportController{
  constructor(private readonly reports:AnalyticsReportService){}

  @Post()
  async create(
    @Body() body:{
      from?:string;
      to?:string;
      propertyId?:string|null;
      format?:AnalyticsReportFormat;
    },
    @Headers("idempotency-key") idempotencyKey:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      if(!body.from||!body.to||!body.format){
        throw new BadRequestException("from, to and format are required");
      }
      return await this.reports.create(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        {
          from:body.from,
          to:body.to,
          propertyId:body.propertyId
            ?requireUuid(body.propertyId,"property_id")
            :null,
          format:body.format
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

  @Get(":id/content")
  async content(
    @Param("id") id:string,
    @Headers("if-none-match") ifNoneMatch:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Res() response:Response
  ){
    try{
      const result=await this.reports.content(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"report_job_id")
      );

      const etag='"sha256-'+result.contentSha256+'"';
      response.setHeader("ETag",etag);
      response.setHeader("Cache-Control","private, no-cache, must-revalidate");
      response.setHeader("Content-Type",result.contentType);
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="'+result.fileName+'"'
      );
      response.setHeader("X-Content-SHA256",result.contentSha256);

      if(matchesIfNoneMatch(ifNoneMatch,etag)){
        response.status(304).end();
        return;
      }

      response.status(200).send(result.content);
    }catch(error){
      const mapped=mapReportError(error);
      response.status(mapped.getStatus()).json(mapped.getResponse());
    }
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
  if(
    message==="REPORT_IDEMPOTENCY_CONFLICT"||
    message==="REPORT_NOT_READY"
  )return new ConflictException(message);
  if(message==="REPORT_EXPIRED")return new GoneException(message);
  if(
    message.startsWith("INVALID_")||
    message==="ANALYTICS_RANGE_TOO_LARGE"
  )return new BadRequestException(message);
  return new BadRequestException(message);
}
