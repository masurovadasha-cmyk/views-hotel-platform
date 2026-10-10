import {
  BadRequestException,Controller,Headers,Param,Post,RawBodyRequest,Req,ServiceUnavailableException
} from "@nestjs/common";
import type {Request} from "express";
import {PaymentProviderNotConnectedError} from "./payment-provider.registry";
import type {SupportedPaymentProvider} from "./payment-provider.port";
import {PaymentWebhookService} from "./payment-webhook.service";

const allowedProviders=new Set<SupportedPaymentProvider>(["payme","click","uzum","octo","multicard","stripe"]);

@Controller("v1/payments/webhooks")
export class PaymentWebhookController{
  constructor(private readonly webhooks:PaymentWebhookService){}

  @Post(":provider")
  async ingest(
    @Param("provider") provider:string,
    @Req() request:RawBodyRequest<Request>
  ){
    if(!allowedProviders.has(provider as SupportedPaymentProvider)){
      throw new BadRequestException("Unsupported payment provider");
    }
    if(!request.rawBody)throw new BadRequestException("Raw webhook body required");
    const normalized:Record<string,string|undefined>={};
    for(const [key,value] of Object.entries(request.headers)){
      normalized[key]=Array.isArray(value)?value.join(","):value;
    }
    try{
      return await this.webhooks.processRaw(
        provider as SupportedPaymentProvider,
        request.rawBody.toString("utf8"),
        normalized
      );
    }catch(error){
      if(error instanceof PaymentProviderNotConnectedError){
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }
}
