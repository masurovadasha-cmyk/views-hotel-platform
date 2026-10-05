import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,
  Headers,NotFoundException,Param,Post,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {AnalyticsReportScheduleService} from "./analytics-report-schedule.service";

type ScheduleBody={
  reportType?:"dashboard_summary";
  format?:"json"|"csv";
  cadence?:"daily"|"weekly"|"monthly";
  periodKind?:"previous_day"|"previous_7_days"|"previous_month";
  localTime?:string;
  isoWeekday?:number|null;
  dayOfMonth?:number|null;
  propertyId?:string|null;
};

@Controller("v1/analytics/report-schedules")
export class AnalyticsReportScheduleController{
  constructor(private readonly schedules:AnalyticsReportScheduleService){}

  @Post()
  async create(
    @Headers("idempotency-key") idempotencyKey:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Body() body:ScheduleBody
  ){
    try{
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      if(
        !body.reportType||!body.format||!body.cadence||
        !body.periodKind||!body.localTime
      ){
        throw new BadRequestException("Incomplete report schedule request");
      }

      return await this.schedules.create(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        {
          reportType:body.reportType,
          format:body.format,
          cadence:body.cadence,
          periodKind:body.periodKind,
          localTime:body.localTime,
          isoWeekday:body.isoWeekday,
          dayOfMonth:body.dayOfMonth,
          propertyId:body.propertyId
            ?requireUuid(body.propertyId,"property_id")
            :null
        },
        idempotencyKey
      );
    }catch(error){throw mapScheduleError(error)}
  }

  @Get()
  async list(
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.schedules.list(
        actorFromHeaders(organizationId,userId,membershipId,requestId)
      );
    }catch(error){throw mapScheduleError(error)}
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
      return await this.schedules.get(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"report_schedule_id")
      );
    }catch(error){throw mapScheduleError(error)}
  }

  @Post(":id/pause")
  async pause(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.schedules.pause(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"report_schedule_id")
      );
    }catch(error){throw mapScheduleError(error)}
  }

  @Post(":id/resume")
  async resume(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.schedules.resume(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"report_schedule_id")
      );
    }catch(error){throw mapScheduleError(error)}
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

function mapScheduleError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException||
    error instanceof NotFoundException||
    error instanceof ConflictException
  )return error;

  const message=error instanceof Error?error.message:"REPORT_SCHEDULE_ERROR";
  if(message==="PROPERTY_FORBIDDEN"||message==="ANALYTICS_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message==="REPORT_SCHEDULE_NOT_FOUND"){
    return new NotFoundException(message);
  }
  if(message==="IDEMPOTENCY_CONFLICT"){
    return new ConflictException(message);
  }
  if(
    message.startsWith("INVALID_")||
    message==="ORGANIZATION_NOT_FOUND"
  )return new BadRequestException(message);

  return new BadRequestException(message);
}
