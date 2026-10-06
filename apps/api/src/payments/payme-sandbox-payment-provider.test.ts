import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {PaymeSandboxPaymentProvider} from "./payme-sandbox-payment-provider";
import {PaymentIntentService} from "./payment-intent.service";
import {PaymentProviderNotConnectedError} from "./payment-provider.registry";
const original={...process.env};
const organizationId="73000000-0000-4000-8000-000000000001";
const request={organizationId,paymentIntentId:"73333333-3333-4333-8333-333333333333",amountMinor:500000n,
  currency:"UZS",returnUrl:"https://views.example/payments/return",metadata:{reservationId:"fixture"}};
const provider=()=>new PaymeSandboxPaymentProvider({register:()=>undefined} as never);
beforeEach(()=>{
  process.env.VIEWS_PAYME_SANDBOX_ENABLED="true";process.env.VIEWS_PAYME_MODE="sandbox";
  process.env.VIEWS_PAYME_ORGANIZATION_ID=organizationId;process.env.VIEWS_PAYME_MERCHANT_ID="0123456789abcdef01234567";
  process.env.VIEWS_PAYME_MERCHANT_LOGIN="views-payme-test";process.env.VIEWS_PAYME_TEST_KEY="fixture-test-key-0123456789abcdef";
});
afterEach(()=>{for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);});
describe("Payme sandbox checkout binding",()=>{
  it("registers only when explicitly enabled",()=>{
    const registered:unknown[]=[];const p=new PaymeSandboxPaymentProvider({register:(value:unknown)=>registered.push(value)} as never);
    p.onModuleInit();expect(registered).toEqual([p]);
    process.env.VIEWS_PAYME_SANDBOX_ENABLED="false";p.onModuleInit();expect(registered).toHaveLength(1);
  });
  it("builds a sandbox checkout with the reviewed merchant/account/amount",async()=>{
    const result=await provider().createHostedCheckout(request);
    expect(result.checkoutUrl.startsWith("https://test.paycom.uz/")).toBe(true);
    const decoded=Buffer.from(result.checkoutUrl.split("/").at(-1)!,"base64").toString("utf8");
    expect(decoded).toContain("m=0123456789abcdef01234567");
    expect(decoded).toContain("ac.payment_intent_id="+request.paymentIntentId);
    expect(decoded).toContain("a=500000");expect(decoded).toContain("cr=860");expect(decoded).toContain("c="+request.returnUrl);
  });
  it("refuses a checkout for another organization",async()=>{
    await expect(provider().createHostedCheckout({...request,organizationId:"74000000-0000-4000-8000-000000000001"}))
      .rejects.toBeInstanceOf(PaymentProviderNotConnectedError);
  });
  it("checks provider scope before accessing the payment database",async()=>{
    let dbCalls=0;const p=provider();
    const service=new PaymentIntentService({withActor:()=>{dbCalls++;throw new Error("UNEXPECTED_DATABASE_CALL");}} as never,{get:()=>p} as never);
    await expect(service.create({actor:{organizationId:"74000000-0000-4000-8000-000000000001",userId:request.paymentIntentId,membershipId:request.paymentIntentId,requestId:request.paymentIntentId},
      reservationId:request.paymentIntentId,quoteId:request.paymentIntentId,provider:"payme",idempotencyKey:"fixture-key",returnUrl:request.returnUrl}))
      .rejects.toBeInstanceOf(PaymentProviderNotConnectedError);
    expect(dbCalls).toBe(0);
  });
  it("does not enable a production provider mode",()=>{
    process.env.VIEWS_PAYME_MODE="production";expect(()=>provider().onModuleInit()).toThrow("PAYME_PRODUCTION_NOT_ENABLED");
  });
  it("rejects unsafe or unrepresentable amounts",async()=>{
    for(const amountMinor of [0n,-1n,BigInt(Number.MAX_SAFE_INTEGER)+1n])
      await expect(provider().createHostedCheckout({...request,amountMinor})).rejects.toThrow("INVALID_PAYME_AMOUNT");
    await expect(provider().createHostedCheckout({...request,currency:"USD"})).rejects.toThrow("INVALID_PAYME_CURRENCY");
  });
  it("rejects account-field injection and malformed return URLs",async()=>{
    await expect(provider().createHostedCheckout({...request,paymentIntentId:request.paymentIntentId+";a=1"})).rejects.toThrow("INVALID_PAYME_PAYMENT_INTENT_ID");
    for(const returnUrl of ["http://views.example/","https://user:pass@views.example/","https://views.example/;a=1","https://views.example/#fragment"])
      await expect(provider().createHostedCheckout({...request,returnUrl})).rejects.toThrow("INVALID_PAYME_RETURN_URL");
  });
  it("does not pretend a generic webhook or outbound refund is implemented",async()=>{
    await expect(provider().verifyAndParseWebhook("",{})).rejects.toThrow("PAYME_USES_MERCHANT_API_NOT_WEBHOOK");
    await expect(provider().refund({paymentIntentId:request.paymentIntentId,externalCaptureId:"fixture",amountMinor:1n,currency:"UZS",idempotencyKey:"refund-fixture"}))
      .rejects.toThrow("PAYME_REFUND_REQUIRES_MERCHANT_API_CANCELLATION");
  });
});
