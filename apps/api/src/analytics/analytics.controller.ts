import {
  BadRequestException,Controller,ForbiddenException,Get,Headers,Param,Post,Query,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsQueryService} from "./analytics-query.service";

@Controller("v1/analytics")
export class AnalyticsController{
  constructor(
    private readonly projections:AnalyticsProjectionService,
    private readonly queries:AnalyticsQueryService
  ){}

  @Post("project")
  async project(
    @Query("limit") limit:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.projections.processBatch(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        limit===undefined?100:Number(limit)
      );
    }catch(error){throw mapAnalyticsError(error)}
  }

  @Get("health")
  async health(
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.queries.projectionHealth(
        actorFromHeaders(organizationId,userId,membershipId,requestId)
      );
    }catch(error){throw mapAnalyticsError(error)}
  }

  @Get("organization/rollups/daily")
  async organizationRollups(
    @Query("from") from:string|undefined,
    @Query("to") to:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!from||!to)throw new BadRequestException("from and to are required");
      return await this.queries.organizationDailyRollup(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        from,to
      );
    }catch(error){throw mapAnalyticsError(error)}
  }

  @Get("properties/:id/rollups/daily")
  async propertyRollups(
    @Param("id") id:string,
    @Query("from") from:string|undefined,
    @Query("to") to:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!from||!to)throw new BadRequestException("from and to are required");
      return await this.queries.propertyDailyRollup(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"property_id"),
        from,to
      );
    }catch(error){throw mapAnalyticsError(error)}
  }

  @Get("properties/:id/dimensions")
  async propertyDimensions(
    @Param("id") id:string,
    @Query("from") from:string|undefined,
    @Query("to") to:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!from||!to)throw new BadRequestException("from and to are required");
      return await this.queries.propertyDimensions(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"property_id"),
        from,to
      );
    }catch(error){throw mapAnalyticsError(error)}
  }

  @Get("properties/:id/booking-cohorts")
  async bookingCohorts(
    @Param("id") id:string,
    @Query("from") from:string|undefined,
    @Query("to") to:string|undefined,
    @Query("bookingChannel") bookingChannel:string|undefined,
    @Query("marketSegment") marketSegment:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!from||!to)throw new BadRequestException("from and to are required");
      return await this.queries.propertyBookingCohorts(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"property_id"),
        from,to,bookingChannel,marketSegment
      );
    }catch(error){throw mapAnalyticsError(error)}
  }

  @Get("properties/:id/daily")
  async propertyDaily(
    @Param("id") id:string,
    @Query("from") from:string|undefined,
    @Query("to") to:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!from||!to)throw new BadRequestException("from and to are required");
      return await this.queries.propertyDaily(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"property_id"),
        from,to
      );
    }catch(error){throw mapAnalyticsError(error)}
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

function mapAnalyticsError(error:unknown){
  if(error instanceof BadRequestException||error instanceof UnauthorizedException||error instanceof ForbiddenException){
    return error;
  }
  const message=error instanceof Error?error.message:"ANALYTICS_ERROR";
  if(message==="PROPERTY_FORBIDDEN"||message==="ANALYTICS_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message.startsWith("INVALID_")||message==="ANALYTICS_INVALID_STAY_NIGHTS"){
    return new BadRequestException(message);
  }
  return new BadRequestException(message);
}
