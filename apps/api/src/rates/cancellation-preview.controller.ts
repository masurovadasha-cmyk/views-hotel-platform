import {Controller,ForbiddenException,Headers,NotFoundException,Param,Post,BadRequestException} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {CancellationPreviewService} from "./cancellation-preview.service";

@Controller("v1/bookings")
export class CancellationPreviewController{
  constructor(private readonly previews:CancellationPreviewService){}

  @Post(":id/cancellation-preview")
  async preview(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      const actor={
        organizationId:requireUuid(organizationId,"organization_id"),
        userId:requireUuid(userId,"user_id"),
        membershipId:requireUuid(membershipId,"membership_id"),
        requestId:requestId||crypto.randomUUID()
      };
      const result=await this.previews.preview(actor,requireUuid(id,"reservation_id"));
      return JSON.parse(JSON.stringify(result,(_,v)=>typeof v==="bigint"?v.toString():v));
    }catch(error){
      if(error instanceof Error&&error.message==="PROPERTY_FORBIDDEN")throw new ForbiddenException(error.message);
      if(error instanceof Error&&error.message==="RESERVATION_NOT_FOUND")throw new NotFoundException(error.message);
      if(error instanceof Error&&error.message==="CANCELLATION_NOT_AVAILABLE")throw new BadRequestException(error.message);
      if(error instanceof Error&&error.message.startsWith("INVALID_"))throw new BadRequestException(error.message);
      throw error;
    }
  }
}
