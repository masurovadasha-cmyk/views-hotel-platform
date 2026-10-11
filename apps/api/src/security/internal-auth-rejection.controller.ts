import {
  BadRequestException,Controller,ForbiddenException,Get,Headers,
  Query,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {InternalAuthRejectionService} from "./internal-auth-rejection.service";

@Controller("v1/security/internal-auth-rejections")
export class InternalAuthRejectionController{
  constructor(private readonly rejections:InternalAuthRejectionService){}

  @Get()
  async list(
    @Query("hours") hours:string|undefined,
    @Query("limit") limit:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.rejections.list(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        hours===undefined?24:Number(hours),
        limit===undefined?100:Number(limit)
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

  const message=error instanceof Error?error.message:"SECURITY_REJECTION_ERROR";
  if(message==="SECURITY_REJECTION_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message.startsWith("INVALID_")){
    return new BadRequestException(message);
  }
  return new BadRequestException(message);
}
