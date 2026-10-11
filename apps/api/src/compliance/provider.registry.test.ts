import {describe,expect,it} from "vitest";
import {ComplianceProviderRegistry} from "./provider.registry";

describe("compliance provider registry",()=>{
  it("starts with no fake live providers",()=>{
    const registry=new ComplianceProviderRegistry();
    expect(registry.connected()).toEqual({
      guestRegistration:[],fiscalization:[],documentVaults:[]
    });
    expect(()=>registry.guestRegistration("emehmon")).toThrow("REGISTRATION_PROVIDER_NOT_CONNECTED");
    expect(()=>registry.fiscalizationProvider("virtual-cash")).toThrow("FISCALIZATION_PROVIDER_NOT_CONNECTED");
  });
});
