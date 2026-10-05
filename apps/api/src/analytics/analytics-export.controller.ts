import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,
  Headers,NotFoundException,Param,Post,ServiceUnavailableException,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {
  AnalyticsExportService,type AnalyticsExportReportType
} from "./analytics-export.service";

@Controller("v1/analytics/exports")
export class AnalyticsExportController{
  constructor(private readonly exports:AnalyticsExportService){}

  @Post()
  async create(
    @Body() body:{
      reportType?:AnalyticsExportReportType;
      from?:string;
      to?:string;
      propertyId?:string|null;
    },
    @Headers("idempotency-key") idempotencyKey:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      if(!body.reportType||!body.from||!body.to){
        throw new BadRequestException("reportType, from and to are required");
      }

      return await this.exports.create(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        {
          reportType:body.reportType,
          from:body.from,
          to:body.to,
          propertyId:body.propertyId
            ?requireUuid(body.propertyId,"property_id")
            :null
        },
        idempotencyKey
      );
    }catch(error){throw mapExportError(error)}
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
      return await this.exports.get(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"analytics_export_id")
      );
    }catch(error){throw mapExportError(error)}
  }

  @Post(":id/cancel")
  async cancel(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.exports.cancel(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"analytics_export_id")
      );
    }catch(error){throw mapExportError(error)}
  }

  @Get(":id/download")
  async download(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.exports.download(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"analytics_export_id")
      );
    }catch(error){throw mapExportError(error)}
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

function mapExportError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException||
    error instanceof NotFoundException||
    error instanceof ConflictException||
    error instanceof ServiceUnavailableException
  )return error;

  const message=error instanceof Error?error.message:"ANALYTICS_EXPORT_ERROR";
  if(message==="PROPERTY_FORBIDDEN"||message==="ANALYTICS_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message==="ANALYTICS_EXPORT_NOT_FOUND"){
    return new NotFoundException(message);
  }
  if([
    "ANALYTICS_EXPORT_IDEMPOTENCY_CONFLICT",
    "ANALYTICS_EXPORT_NOT_CANCELLABLE",
    "ANALYTICS_EXPORT_NOT_READY"
  ].includes(message)){
    return new ConflictException(message);
  }
  if(message==="ANALYTICS_EXPORT_STORAGE_NOT_CONNECTED"){
    return new ServiceUnavailableException(message);
  }
  if(message.startsWith("INVALID_")||message.startsWith("ANALYTICS_EXPORT_PROPERTY_")||
     message==="ANALYTICS_RANGE_TOO_LARGE"){
    return new BadRequestException(message);
  }
  return new BadRequestException(message);
}
