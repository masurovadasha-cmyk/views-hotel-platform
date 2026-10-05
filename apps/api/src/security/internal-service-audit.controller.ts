import {
  BadRequestException,Controller,ForbiddenException,Get,Headers,
  Query,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {InternalServiceAuditService} from "./internal-service-audit.service";

@Controller("v1/security/internal-service-audit")
export class InternalServiceAuditController{
  constructor(private readonly audit:InternalServiceAuditService){}

  @Get()
  async list(
    @Query("limit") limit:string|undefined,
    @Query("serviceId") serviceId:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.audit.list(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        limit===undefined?100:Number(limit),
        serviceId
      );
    }catch(error){throw mapAuditError(error)}
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

function mapAuditError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException
  )return error;

  const message=error instanceof Error?error.message:"SECURITY_AUDIT_ERROR";
  if(message==="SECURITY_AUDIT_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message.startsWith("INVALID_")){
    return new BadRequestException(message);
  }
  return new BadRequestException(message);
}
