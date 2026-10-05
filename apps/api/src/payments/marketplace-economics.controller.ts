import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,Headers,
  NotFoundException,Param,Post,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {MarketplaceEconomicsService} from "./marketplace-economics.service";

@Controller("v1/marketplace/economics")
export class MarketplaceEconomicsController{
  constructor(private readonly economics:MarketplaceEconomicsService){}

  @Post("reservations/:id/drafts")
  async createDraft(
    @Param("id") id:string,
    @Headers("idempotency-key") idempotencyKey:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Body() body:{
      sourceKind?:"manual"|"contract"|"provider";
      sourceReference?:string;
      platformCommissionMinor?:string;
      ownerPayableMinor?:string;
      taxesWithheldMinor?:string;
      otherDeductionsMinor?:string;
    }
  ){
    try{
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      if(!body.sourceKind)throw new BadRequestException("sourceKind is required");
      return serialize(await this.economics.createDraft({
        actor:actorFromHeaders(organizationId,userId,membershipId,requestId),
        reservationId:requireUuid(id,"reservation_id"),
        idempotencyKey,
        sourceKind:body.sourceKind,
        sourceReference:body.sourceReference,
        platformCommissionMinor:parseMinor(body.platformCommissionMinor,"platformCommissionMinor"),
        ownerPayableMinor:parseMinor(body.ownerPayableMinor,"ownerPayableMinor"),
        taxesWithheldMinor:parseMinor(body.taxesWithheldMinor??"0","taxesWithheldMinor"),
        otherDeductionsMinor:parseMinor(body.otherDeductionsMinor??"0","otherDeductionsMinor")
      }));
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
      return serialize(await this.economics.finalize(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"economics_snapshot_id")
      ));
    }catch(error){throw mapEconomicsError(error)}
  }

  @Get("reservations/:id")
  async listReservation(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.economics.listReservation(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"reservation_id")
      );
    }catch(error){throw mapEconomicsError(error)}
  }
}

function parseMinor(value:string|undefined,name:string){
  if(value===undefined||!/^d+$/.test(value))throw new BadRequestException(name+" must be a non-negative integer string");
  return BigInt(value);
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
  if(["RESERVATION_NOT_FOUND","ECONOMICS_SNAPSHOT_NOT_FOUND"].includes(message)){
    return new NotFoundException(message);
  }
  if([
    "ECONOMICS_RESERVATION_NOT_ELIGIBLE","ECONOMICS_NET_MISMATCH",
    "ECONOMICS_IDEMPOTENCY_CONFLICT","ECONOMICS_PAYMENT_STATE_NOT_SETTLED",
    "ECONOMICS_PAYMENT_STATE_CHANGED","ECONOMICS_FINALIZE_TOO_EARLY",
    "ECONOMICS_FINALIZE_CONFLICT","ECONOMICS_SNAPSHOT_NOT_DRAFT"
  ].includes(message)){
    return new ConflictException(message);
  }
  if(message.startsWith("INVALID_")||message.startsWith("ECONOMICS_PAYMENT_CURRENCY")){
    return new BadRequestException(message);
  }
  return new BadRequestException(message);
}

function serialize<T>(value:T):T{
  return JSON.parse(JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v)) as T;
}
