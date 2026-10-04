import {BadRequestException,Controller,Get,Headers,Query,UnauthorizedException} from "@nestjs/common";
import {AvailabilityService} from "./availability.service";
@Controller("v1/availability")
export class AvailabilityController{
 constructor(private readonly availability:AvailabilityService){}
 @Get("unit")
 async unit(@Headers("x-organization-id") organizationId:string|undefined,@Query("unitId") unitId:string|undefined,@Query("checkInAt") checkInAt:string|undefined,@Query("checkOutAt") checkOutAt:string|undefined){
  if(!organizationId)throw new UnauthorizedException("organization context required");
  if(!unitId||!checkInAt||!checkOutAt)throw new BadRequestException("unitId, checkInAt and checkOutAt are required");
  return {available:await this.availability.isAvailable({organizationId,unitId,checkInAt,checkOutAt})};
 }
}