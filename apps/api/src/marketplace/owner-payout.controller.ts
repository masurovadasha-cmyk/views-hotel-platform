import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,
  Headers,NotFoundException,Param,Post,ServiceUnavailableException,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {OwnerPayoutProviderNotConnectedError} from "./owner-payout-provider.registry";
import {OwnerPayoutService} from "./owner-payout.service";

@Controller("v1/marketplace/payouts")
export class OwnerPayoutController{
  constructor(private readonly payouts:OwnerPayoutService){}

  @Get("providers")
  providers(){return {providers:this.payouts.connectedProviders()}}

  @Post("economics/:id/prepare")
  async prepare(
    @Param("id") id:string,
    @Headers("idempotency-key") idempotencyKey:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Body() body:{provider?:string;destinationRef?:string}
  ){
    try{
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      if(!body.provider||!body.destinationRef){
        throw new BadRequestException("provider and destinationRef are required");
      }
      return await this.payouts.prepare(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"economics_snapshot_id"),
        body.provider,body.destinationRef,idempotencyKey
      );
    }catch(error){throw mapPayoutError(error)}
  }

  @Post(":id/submit")
  async submit(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.payouts.submitNow(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"payout_instruction_id")
      );
    }catch(error){throw mapPayoutError(error)}
  }

  @Get(":id")
  async get(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.payouts.getInstruction(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"payout_instruction_id")
      );
    }catch(error){throw mapPayoutError(error)}
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

function mapPayoutError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException||
    error instanceof NotFoundException||
    error instanceof ConflictException||
    error instanceof ServiceUnavailableException
  )return error;

  if(error instanceof OwnerPayoutProviderNotConnectedError){
    return new ServiceUnavailableException(error.message);
  }

  const message=error instanceof Error?error.message:"PAYOUT_ERROR";
  if(message==="PROPERTY_FORBIDDEN"||message==="PAYOUT_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(["PAYOUT_NOT_FOUND","PAYOUT_ECONOMICS_NOT_FOUND"].includes(message)){
    return new NotFoundException(message);
  }
  if([
    "PAYOUT_ECONOMICS_NOT_FINALIZED","PAYOUT_ECONOMICS_NOT_RECONCILED",
    "PAYOUT_ECONOMICS_LEDGER_MISSING","PAYOUT_NOT_REQUIRED",
    "PAYOUT_SOURCE_LEDGER_MISMATCH","PAYOUT_IDEMPOTENCY_CONFLICT",
    "PAYOUT_NOT_CLAIMABLE","PAYOUT_WORKER_LEASE_LOST","PAYOUT_CONFIRM_CONFLICT"
  ].includes(message)){
    return new ConflictException(message);
  }
  if(message.startsWith("INVALID_")||message.startsWith("PAYOUT_")){
    return new BadRequestException(message);
  }
  return new BadRequestException(message);
}
