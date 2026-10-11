import {describe,expect,it} from "vitest";
import {integrationCatalog,publicIntegrationView} from "./integrations";
describe("integration catalog",()=>{
  it("returns credential metadata without values",()=>{const v=publicIntegrationView(integrationCatalog[0]);expect(v.credentialSlots[0]).toEqual({name:"client_id",configured:false})});
  it("marks Airbnb as partner-gated",()=>expect(integrationCatalog.find(x=>x.provider==="airbnb")?.status).toBe("partner_access_required"));
  it("keeps AI concierge vendor-neutral",()=>expect(integrationCatalog.find(x=>x.provider==="ai_concierge")?.capabilities).toContain("guest_chat"));
});
