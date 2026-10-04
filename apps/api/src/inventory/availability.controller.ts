import {BadRequestException,Controller,Get,Headers,Query,UnauthorizedException} from "@nestjs/common";
import {AvailabilityService} from "./availability.service";
import {requireUuid} from "../identity/actor-context";

@Controller("v1/availability")
export class AvailabilityController{
 constructor(private readonly availability:AvailabilityService){}
 @Get("unit")
 async unit(
  @Headers("x-organization-id") organizationId:string|undefined,
  @Headers("x-user-id") userId:string|undefined,
  @Headers("x-membership-id") membershipId:string|undefined,
  @Headers("x-request-id") requestId:string|undefined,
  @Query("unitId") unitId:string|undefined,
  @Query("checkInAt") checkInAt:string|undefined,
  @Query("checkOutAt") checkOutAt:string|undefined
 ){
  try{
   const actor={
    organizationId:requireUuid(organizationId,"organization_id"),
    userId:requireUuid(userId,"user_id"),
    membershipId:requireUuid(membershipId,"membership_id"),
    requestId:requestId||crypto.randomUUID()
   };
   if(!unitId||!checkInAt||!checkOutAt)throw new BadRequestException("unitId, checkInAt and checkOutAt are required");
   return {available:await this.availability.isAvailable({actor,unitId,checkInAt,checkOutAt})};
  }catch(error){
   if(error instanceof BadRequestException)throw error;
   if(error instanceof Error&&error.message.startsWith("INVALID_"))throw new UnauthorizedException("valid actor context required");
   throw error;
  }
 }
}