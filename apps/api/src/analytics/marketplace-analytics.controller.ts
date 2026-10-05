import {BadRequestException,Controller,ForbiddenException,Get,Headers,Param,Query,UnauthorizedException} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {MarketplaceAnalyticsQueryService} from "./marketplace-analytics-query.service";

@Controller("v1/analytics")
export class MarketplaceAnalyticsController{
  constructor(private readonly queries:MarketplaceAnalyticsQueryService){}

  @Get("properties/:id/marketplace-economics")
  async propertyEconomics(
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
      return await this.queries.propertyEconomics(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"property_id"),from,to,bookingChannel,marketSegment
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
  if(message.startsWith("INVALID_"))return new BadRequestException(message);
  return new BadRequestException(message);
}