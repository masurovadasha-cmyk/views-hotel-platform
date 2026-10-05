import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,
  Headers,NotFoundException,Post,ServiceUnavailableException,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import type {GuestAuthChannel} from "./guest-auth-delivery.port";
import {GuestAuthService} from "./guest-auth.service";

@Controller("v1/guest-auth")
export class GuestAuthController{
  constructor(private readonly auth:GuestAuthService){}

  @Post("challenges")
  async createChallenge(
    @Body() body:{reservationId?:string;channel?:GuestAuthChannel;ttlMinutes?:number},
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!body.reservationId||!body.channel){
        throw new BadRequestException("reservationId and channel are required");
      }
      return await this.auth.createChallenge(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(body.reservationId,"reservation_id"),
        body.channel,
        body.ttlMinutes
      );
    }catch(error){throw mapGuestAuthError(error)}
  }

  @Post("exchange")
  async exchange(
    @Body() body:{token?:string;sessionTtlMinutes?:number}
  ){
    try{
      if(!body.token)throw new UnauthorizedException("guest exchange token required");
      return await this.auth.exchange(body.token,body.sessionTtlMinutes);
    }catch(error){throw mapGuestAuthError(error)}
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

function mapGuestAuthError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException||
    error instanceof NotFoundException||
    error instanceof ConflictException||
    error instanceof ServiceUnavailableException
  )return error;

  const message=error instanceof Error?error.message:"GUEST_AUTH_ERROR";
  if(message==="GUEST_AUTH_CHALLENGE_INVALID"){
    return new UnauthorizedException(message);
  }
  if(message==="PROPERTY_FORBIDDEN"||message==="COMPLIANCE_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message==="RESERVATION_NOT_FOUND")return new NotFoundException(message);
  if(message==="GUEST_ACCESS_NOT_AVAILABLE")return new ConflictException(message);
  if(
    message==="GUEST_AUTH_DELIVERY_NOT_CONNECTED"||
    message==="GUEST_AUTH_DELIVERY_FAILED"
  )return new ServiceUnavailableException(message);
  if(
    message==="GUEST_AUTH_DESTINATION_MISSING"||
    message.startsWith("INVALID_")
  )return new BadRequestException(message);
  return new BadRequestException(message);
}
