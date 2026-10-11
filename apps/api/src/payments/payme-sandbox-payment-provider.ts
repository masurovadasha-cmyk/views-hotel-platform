import {Injectable,OnModuleInit} from "@nestjs/common";
import {PaymentProviderRegistry,PaymentProviderNotConnectedError} from "./payment-provider.registry";
import type {HostedCheckoutRequest,HostedCheckoutResult,PaymentProviderPort,RefundRequest,RefundResult,VerifiedWebhookEvent} from "./payment-provider.port";
import {loadPaymeSandboxConfig} from "./payme-sandbox.config";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PaymeSandboxPaymentProvider implements PaymentProviderPort,OnModuleInit{
  readonly provider="payme" as const;
  constructor(private readonly registry:PaymentProviderRegistry){}
  onModuleInit(){if(loadPaymeSandboxConfig())this.registry.register(this);}

  assertOrganizationAllowed(organizationId:string){
    const config=loadPaymeSandboxConfig();
    if(!config||typeof organizationId!=="string"||organizationId.toLowerCase()!==config.organizationId.toLowerCase()){
      throw new PaymentProviderNotConnectedError(this.provider);
    }
  }

  async createHostedCheckout(input:HostedCheckoutRequest):Promise<HostedCheckoutResult>{
    this.assertOrganizationAllowed(input.organizationId);
    const config=loadPaymeSandboxConfig()!;
    if(!UUID.test(input.paymentIntentId))throw new Error("INVALID_PAYME_PAYMENT_INTENT_ID");
    if(input.currency!=="UZS")throw new Error("INVALID_PAYME_CURRENCY");
    if(typeof input.amountMinor!=="bigint"||input.amountMinor<=0n||input.amountMinor>BigInt(Number.MAX_SAFE_INTEGER)){
      throw new Error("INVALID_PAYME_AMOUNT");
    }
    let returnUrl:URL;
    try{returnUrl=new URL(input.returnUrl);}catch{throw new Error("INVALID_PAYME_RETURN_URL");}
    if(returnUrl.protocol!=="https:"||returnUrl.username||returnUrl.password||returnUrl.hash||
      input.returnUrl.length>1000||/[;\r\n\x00-\x1f\x7f]/.test(input.returnUrl))throw new Error("INVALID_PAYME_RETURN_URL");
    const params=["m="+config.merchantId,"ac.payment_intent_id="+input.paymentIntentId.toLowerCase(),
      "a="+input.amountMinor.toString(),"l=ru","c="+returnUrl.href,"cr=860"].join(";");
    const encoded=Buffer.from(params,"utf8").toString("base64").replace(/=+$/,"");
    return {providerAttemptRef:"payme-sandbox:"+input.paymentIntentId,checkoutUrl:config.checkoutBaseUrl+"/"+encoded,expiresAt:null};
  }
  async verifyAndParseWebhook(_rawBody:string,_headers:Record<string,string|undefined>):Promise<VerifiedWebhookEvent>{
    throw new Error("PAYME_USES_MERCHANT_API_NOT_WEBHOOK");
  }
  async refund(_input:RefundRequest):Promise<RefundResult>{
    throw new Error("PAYME_REFUND_REQUIRES_MERCHANT_API_CANCELLATION");
  }
}
