import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {PaymeSandboxPaymentProvider} from "./payme-sandbox-payment-provider";

const original={...process.env};
function configure(){
  process.env.VIEWS_PAYME_SANDBOX_ENABLED="true";
  process.env.VIEWS_PAYME_MODE="sandbox";
  process.env.VIEWS_PAYME_ORGANIZATION_ID="73000000-0000-4000-8000-000000000001";
  process.env.VIEWS_PAYME_MERCHANT_ID="0123456789abcdef01234567";
  process.env.VIEWS_PAYME_MERCHANT_LOGIN="views-payme-test";
  process.env.VIEWS_PAYME_TEST_KEY="fixture-test-key-0123456789abcdef";
}
beforeEach(configure);
afterEach(()=>{
  for(const key of Object.keys(process.env)){
    if(!(key in original))delete process.env[key];
  }
  Object.assign(process.env,original);
});

describe("PaymeSandboxPaymentProvider",()=>{
  it("registers only when explicitly enabled",()=>{
    const registered:unknown[]=[];
    const provider=new PaymeSandboxPaymentProvider({
      register:(value:unknown)=>registered.push(value)
    } as never);
    provider.onModuleInit();
    expect(registered).toEqual([provider]);
  });

  it("builds the documented sandbox checkout account and amount",async()=>{
    const provider=new PaymeSandboxPaymentProvider({
      register:()=>undefined
    } as never);
    const result=await provider.createHostedCheckout({
      paymentIntentId:"73333333-3333-4333-8333-333333333333",
      amountMinor:500000n,
      currency:"UZS",
      returnUrl:"https://views.example/payments/return",
      metadata:{reservationId:"x"}
    });
    expect(result.checkoutUrl.startsWith("https://test.paycom.uz/")).toBe(true);
    const encoded=result.checkoutUrl.split("/").at(-1)!;
    const decoded=Buffer.from(encoded,"base64").toString("utf8");
    expect(decoded).toContain("m=0123456789abcdef01234567");
    expect(decoded).toContain(
      "ac.payment_intent_id=73333333-3333-4333-8333-333333333333"
    );
    expect(decoded).toContain("a=500000");
    expect(decoded).toContain("cr=860");
    expect(decoded).toContain(
      "c=https://views.example/payments/return"
    );
  });

  it("does not pretend webhooks or automated refunds exist",async()=>{
    const provider=new PaymeSandboxPaymentProvider({
      register:()=>undefined
    } as never);
    await expect(provider.verifyAndParseWebhook("",{}))
      .rejects.toThrow("PAYME_USES_MERCHANT_API_NOT_WEBHOOK");
    await expect(provider.refund({
      paymentIntentId:"73333333-3333-4333-8333-333333333333",
      externalCaptureId:"capture",
      amountMinor:1n,
      currency:"UZS",
      idempotencyKey:"refund-123"
    })).rejects.toThrow(
      "PAYME_REFUND_REQUIRES_MERCHANT_API_CANCELLATION"
    );
  });
});
