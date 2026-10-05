import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,
  Headers,NotFoundException,Param,Post,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import type {EconomicsSourceKind} from "./marketplace-economics.service";
import {MarketplaceEconomicsService} from "./marketplace-economics.service";

@Controller("v1/marketplace/economics")
export class MarketplaceEconomicsController{
  constructor(private readonly economics:MarketplaceEconomicsService){}

  @Post("reservations/:id/drafts")
  async createDraft(
    @Param("id") id:string,
    @Body() body:{
      platformCommissionMinor?:string;
      ownerPayableMinor?:string;
      taxesWithheldMinor?:string;
      otherDeductionsMinor?:string;
      sourceKind?:EconomicsSourceKind;
      sourceReference?:string;
    },
    @Headers("idempotency-key") idempotencyKey:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      if(body.platformCommissionMinor===undefined||body.ownerPayableMinor===undefined||!body.sourceKind){
        throw new BadRequestException("platformCommissionMinor, ownerPayableMinor and sourceKind are required");
      }
      return await this.economics.createDraft(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"reservation_id"),
        idempotencyKey,
        {
          platformCommissionMinor:body.platformCommissionMinor,
          ownerPayableMinor:body.ownerPayableMinor,
          taxesWithheldMinor:body.taxesWithheldMinor,
          otherDeductionsMinor:body.otherDeductionsMinor,
          sourceKind:body.sourceKind,
          sourceReference:body.sourceReference
        }
      );
    }catch(error){throw mapEconomicsError(error)}
  }

  @Post(":id/finalize")
  async finalize(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.economics.finalize(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"economics_snapshot_id")
      );
    }catch(error){throw mapEconomicsError(error)}
  }

  @Get("reservations/:id")
  async reservationSnapshots(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.economics.reservationSnapshots(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"reservation_id")
      );
    }catch(error){throw mapEconomicsError(error)}
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

function mapEconomicsError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException||
    error instanceof NotFoundException||
    error instanceof ConflictException
  )return error;

  const message=error instanceof Error?error.message:"ECONOMICS_ERROR";
  if(message==="PROPERTY_FORBIDDEN"||message==="ECONOMICS_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message==="RESERVATION_NOT_FOUND"||message==="ECONOMICS_SNAPSHOT_NOT_FOUND"){
    return new NotFoundException(message);
  }
  if([
    "IDEMPOTENCY_CONFLICT","ECONOMICS_RESERVATION_NOT_SETTLEABLE",
    "ECONOMICS_NET_COLLECTED_CHANGED","ECONOMICS_ALREADY_FINALIZED",
    "ECONOMICS_FINALIZE_CONFLICT"
  ].includes(message))return new ConflictException(message);
  if(message.startsWith("INVALID_")||message.startsWith("ECONOMICS_")){
    return new BadRequestException(message);
  }
  return new BadRequestException(message);
}