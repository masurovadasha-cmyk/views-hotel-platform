import {
  BadRequestException,Controller,ForbiddenException,Get,Headers,
  Query,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {InternalServicePostureService} from "./internal-service-posture.service";

@Controller("v1/security/internal-service-posture")
export class InternalServicePostureController{
  constructor(private readonly posture:InternalServicePostureService){}

  @Get()
  async get(
    @Query("hours") hours:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.posture.get(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        hours===undefined?24:Number(hours)
      );
    }catch(error){throw mapError(error)}
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
  }catch{
    throw new UnauthorizedException("valid actor context required");
  }
}

function mapError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException
  )return error;

  const message=error instanceof Error
    ?error.message
    :"INTERNAL_SERVICE_POSTURE_ERROR";

  if(message.includes("INTERNAL_SERVICE_POSTURE_ROLE_FORBIDDEN")){
    return new ForbiddenException("INTERNAL_SERVICE_POSTURE_ROLE_FORBIDDEN");
  }
  if(message.startsWith("INVALID_INTERNAL_SERVICE_POSTURE_")){
    return new BadRequestException(message);
  }
  return new BadRequestException("INTERNAL_SERVICE_POSTURE_ERROR");
}
