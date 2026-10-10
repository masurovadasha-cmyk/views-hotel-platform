import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,Headers,HttpCode,NotFoundException,Param,Post,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {BookingConflictError,HoldExpiredError,IdempotencyConflictError} from "./booking.errors";
import {BookingHoldService} from "./booking-hold.service";
import {BookingLifecycleService} from "./booking-lifecycle.service";

type HoldBody={quoteId?:string;ttlSeconds?:number};

@Controller("v1/bookings")
export class BookingController{
  constructor(private readonly holds:BookingHoldService,private readonly lifecycle:BookingLifecycleService){}

  @Post("holds")
  async createHold(
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Headers("idempotency-key") idempotencyKey:string|undefined,
    @Body() body:HoldBody
  ){
    try{
      const actor=this.actor(organizationId,userId,membershipId,requestId);
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      if(!body.quoteId)throw new BadRequestException("quoteId is required");
      const result=await this.holds.createHold({
        actor,
        quoteId:requireUuid(body.quoteId,"quote_id"),
        idempotencyKey,
        ttlSeconds:body.ttlSeconds
      });
      return serialize(result);
    }catch(error){throw mapError(error)}
  }

  @Post(":id/confirm")
  @HttpCode(200)
  async confirm(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Headers("idempotency-key") idempotencyKey:string|undefined
  ){
    try{
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      return await this.lifecycle.confirmHold(this.actor(organizationId,userId,membershipId,requestId),requireUuid(id,"reservation_id"),idempotencyKey);
    }catch(error){throw mapError(error)}
  }

  @Post(":id/release")
  @HttpCode(200)
  async release(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Headers("idempotency-key") idempotencyKey:string|undefined
  ){
    try{
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      return await this.lifecycle.releaseHold(this.actor(organizationId,userId,membershipId,requestId),requireUuid(id,"reservation_id"),idempotencyKey);
    }catch(error){throw mapError(error)}
  }

  private actor(organizationId?:string,userId?:string,membershipId?:string,requestId?:string){
    try{
      return {
        organizationId:requireUuid(organizationId,"organization_id"),
        userId:requireUuid(userId,"user_id"),
        membershipId:requireUuid(membershipId,"membership_id"),
        requestId:requestId||crypto.randomUUID()
      };
    }catch{throw new UnauthorizedException("valid actor context required")}
  }
}

function serialize<T>(value:T):T{return JSON.parse(JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v)) as T}
function mapError(error:unknown){
  if(error instanceof BadRequestException||error instanceof UnauthorizedException)return error;
  if(error instanceof BookingConflictError)return new ConflictException(error.message);
  if(error instanceof IdempotencyConflictError)return new ConflictException(error.message);
  if(error instanceof HoldExpiredError)return new ConflictException(error.message);
  if(error instanceof Error&&error.message==="PROPERTY_FORBIDDEN")return new ForbiddenException(error.message);
  if(error instanceof Error&&["UNIT_OR_RATE_NOT_FOUND","QUOTE_NOT_FOUND"].includes(error.message))return new NotFoundException(error.message);
  if(error instanceof Error&&error.message==="QUOTE_EXPIRED")return new ConflictException(error.message);
  if(error instanceof Error&&error.message.startsWith("INVALID_"))return new BadRequestException(error.message);
  return error;
}
