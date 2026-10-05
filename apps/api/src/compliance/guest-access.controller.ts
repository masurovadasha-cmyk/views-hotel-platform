import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,Headers,
  NotFoundException,Param,Post,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {GuestAccessService} from "./guest-access.service";

@Controller("v1/guest-access")
export class GuestAccessController{
  constructor(private readonly access:GuestAccessService){}

  @Post("sessions")
  async issue(
    @Body() body:{reservationId?:string;ttlMinutes?:number},
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!body.reservationId)throw new BadRequestException("reservationId is required");
      return await this.access.issue(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(body.reservationId,"reservation_id"),
        body.ttlMinutes
      );
    }catch(error){throw mapGuestAccessError(error)}
  }

  @Post("sessions/:id/revoke")
  async revoke(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.access.revoke(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"guest_access_session_id")
      );
    }catch(error){throw mapGuestAccessError(error)}
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

function mapGuestAccessError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException||
    error instanceof NotFoundException||
    error instanceof ConflictException
  )return error;

  const message=error instanceof Error?error.message:"GUEST_ACCESS_ERROR";
  if(message==="PROPERTY_FORBIDDEN"||message==="COMPLIANCE_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message==="RESERVATION_NOT_FOUND"||message==="GUEST_ACCESS_SESSION_NOT_FOUND"){
    return new NotFoundException(message);
  }
  if(message==="GUEST_ACCESS_NOT_AVAILABLE")return new ConflictException(message);
  if(message.startsWith("INVALID_"))return new BadRequestException(message);
  return new BadRequestException(message);
}
