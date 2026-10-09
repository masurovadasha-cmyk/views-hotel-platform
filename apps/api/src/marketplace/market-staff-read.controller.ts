import {Controller,Get,Headers,Param,Query,BadRequestException,ForbiddenException,UnauthorizedException} from "@nestjs/common";
import {randomUUID} from "node:crypto";
import {requireUuid} from "../identity/actor-context";
import {MarketStaffReadService} from "./market-staff-read.service";

/** Internal, read-only Staff CRM endpoint; global signed-service actor guard applies. */
@Controller("v1/internal/market")
export class MarketStaffReadController{
 constructor(private readonly service:MarketStaffReadService){}
 @Get("properties/:propertyId/orders")
 async list(
  @Param("propertyId") propertyId:string,
  @Headers("x-organization-id") organizationId:string|undefined,
  @Headers("x-user-id") userId:string|undefined,
  @Headers("x-membership-id") membershipId:string|undefined,
  @Headers("x-request-id") requestId:string|undefined,
  @Query("limit") rawLimit:string|undefined
 ){
  let actor;
  let property;
  try{
   actor={organizationId:requireUuid(organizationId,"organization_id"),userId:requireUuid(userId,"user_id"),membershipId:requireUuid(membershipId,"membership_id"),requestId:requestId||randomUUID()};
   property=requireUuid(propertyId,"property_id");
  }catch{throw new UnauthorizedException("trusted actor context and property required")}
  const limit=rawLimit===undefined?50:Number(rawLimit);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new BadRequestException("limit must be 1..100");
  try{return {orders:await this.service.listOrders(actor,property,limit)}}
  catch(error){
   if(error instanceof Error&&error.message==="MARKET_PROPERTY_FORBIDDEN")throw new ForbiddenException("property access denied");
   throw error;
  }
 }
}
