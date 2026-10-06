import {Injectable,OnModuleInit} from "@nestjs/common";
import {
  PaymentProviderRegistry
} from "./payment-provider.registry";
import type {
  HostedCheckoutRequest,
  HostedCheckoutResult,
  PaymentProviderPort,
  RefundRequest,
  RefundResult,
  VerifiedWebhookEvent
} from "./payment-provider.port";
import {
  loadPaymeSandboxConfig
} from "./payme-sandbox.config";

@Injectable()
export class PaymeSandboxPaymentProvider
implements PaymentProviderPort,OnModuleInit{
  readonly provider="payme" as const;

  constructor(private readonly registry:PaymentProviderRegistry){}

  onModuleInit(){
    if(loadPaymeSandboxConfig()){
      this.registry.register(this);
    }
  }

  async createHostedCheckout(
    input:HostedCheckoutRequest
  ):Promise<HostedCheckoutResult>{
    const config=loadPaymeSandboxConfig();
    if(!config)throw new Error("PAYME_SANDBOX_NOT_ENABLED");
    if(input.currency!=="UZS"||input.amountMinor<=0n){
      throw new Error("PAYME_SANDBOX_UNSUPPORTED_CURRENCY");
    }
    if(
      !/^https:\/\//i.test(input.returnUrl)||
      input.returnUrl.length>1000||
      input.returnUrl.includes(";")
    ){
      throw new Error("PAYME_SANDBOX_RETURN_URL_INVALID");
    }

    const params=[
      "m="+config.merchantId,
      "ac.payment_intent_id="+input.paymentIntentId,
      "a="+input.amountMinor.toString(),
      "l=ru",
      "c="+input.returnUrl,
      "cr=860"
    ].join(";");

    const encoded=Buffer.from(params,"utf8")
      .toString("base64")
      .replace(/=+$/,"");

    return {
      providerAttemptRef:"payme-sandbox:"+input.paymentIntentId,
      checkoutUrl:config.checkoutBaseUrl+"/"+encoded,
      expiresAt:null
    };
  }

  async verifyAndParseWebhook(
    _rawBody:string,
    _headers:Record<string,string|undefined>
  ):Promise<VerifiedWebhookEvent>{
    throw new Error("PAYME_USES_MERCHANT_API_NOT_WEBHOOK");
  }

  async refund(
    _input:RefundRequest
  ):Promise<RefundResult>{
    throw new Error("PAYME_REFUND_REQUIRES_MERCHANT_API_CANCELLATION");
  }
}
