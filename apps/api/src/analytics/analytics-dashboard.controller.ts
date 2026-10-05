import {
  BadRequestException,Controller,ForbiddenException,Get,Headers,Query,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";

@Controller("v1/analytics/dashboard")
export class AnalyticsDashboardController{
  constructor(private readonly dashboard:AnalyticsDashboardService){}

  @Get("summary")
  async summary(
    @Query("from") from:string|undefined,
    @Query("to") to:string|undefined,
    @Query("propertyId") propertyId:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!from||!to)throw new BadRequestException("from and to are required");
      return await this.dashboard.summary(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        {
          from,to,
          propertyId:propertyId?requireUuid(propertyId,"property_id"):null
        }
      );
    }catch(error){throw mapDashboardError(error)}
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

function mapDashboardError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException
  )return error;

  const message=error instanceof Error?error.message:"ANALYTICS_DASHBOARD_ERROR";
  if(message==="PROPERTY_FORBIDDEN"||message==="ANALYTICS_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message.startsWith("INVALID_")||message==="ANALYTICS_RANGE_TOO_LARGE"){
    return new BadRequestException(message);
  }
  return new BadRequestException(message);
}
