import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,Headers,
  NotFoundException,Post,ServiceUnavailableException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {PaymentIntentService} from "./payment-intent.service";
import {PaymentProviderNotConnectedError,PaymentProviderRegistry} from "./payment-provider.registry";
import type {SupportedPaymentProvider} from "./payment-provider.port";

const allowedProviders=new Set<SupportedPaymentProvider>(["payme","click","uzum","octo","multicard","stripe"]);

@Controller("v1/payments")
export class PaymentController{
  constructor(
    private readonly intents:PaymentIntentService,
    private readonly registry:PaymentProviderRegistry
  ){}

  @Get("providers")
  providers(){return {connected:this.registry.connected()}}

  @Post("intents")
  async createIntent(
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Headers("idempotency-key") idempotencyKey:string|undefined,
    @Body() body:{reservationId?:string;quoteId?:string;provider?:string;returnUrl?:string}
  ){
    try{
      if(!idempotencyKey)throw new BadRequestException("Idempotency-Key is required");
      if(!body.reservationId||!body.quoteId||!body.provider||!body.returnUrl){
        throw new BadRequestException("Incomplete payment intent request");
      }
      if(!allowedProviders.has(body.provider as SupportedPaymentProvider)){
        throw new BadRequestException("Unsupported payment provider");
      }
      const actor={
        organizationId:requireUuid(organizationId,"organization_id"),
        userId:requireUuid(userId,"user_id"),
        membershipId:requireUuid(membershipId,"membership_id"),
        requestId:requestId||crypto.randomUUID()
      };
      const result=await this.intents.create({
        actor,
        reservationId:requireUuid(body.reservationId,"reservation_id"),
        quoteId:requireUuid(body.quoteId,"quote_id"),
        provider:body.provider as SupportedPaymentProvider,
        idempotencyKey,
        returnUrl:body.returnUrl
      });
      return JSON.parse(JSON.stringify(result,(_,v)=>typeof v==="bigint"?v.toString():v));
    }catch(error){
      if(error instanceof BadRequestException)return Promise.reject(error);
      if(error instanceof PaymentProviderNotConnectedError){
        throw new ServiceUnavailableException(error.message);
      }
      if(error instanceof Error&&error.message.startsWith("INVALID_")){
        throw new BadRequestException(error.message);
      }
      if(error instanceof Error&&error.message==="PROPERTY_FORBIDDEN"){
        throw new ForbiddenException(error.message);
      }
      if(error instanceof Error&&error.message==="RESERVATION_NOT_FOUND"){
        throw new NotFoundException(error.message);
      }
      if(error instanceof Error&&[
        "RESERVATION_NOT_ON_HOLD","HOLD_EXPIRED","QUOTE_RESERVATION_MISMATCH",
        "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYMENT"
      ].includes(error.message)){
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
