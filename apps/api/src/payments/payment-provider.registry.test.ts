import {describe,expect,it} from "vitest";
import {PaymentProviderNotConnectedError,PaymentProviderRegistry} from "./payment-provider.registry";

describe("payment provider registry",()=>{
  it("does not pretend a provider is connected",()=>{
    const registry=new PaymentProviderRegistry();
    expect(()=>registry.get("payme")).toThrow(PaymentProviderNotConnectedError);
    expect(registry.connected()).toEqual([]);
  });
});
