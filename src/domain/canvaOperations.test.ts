import {describe,expect,it} from "vitest";
import {serviceCatalog,operationalExceptions} from "./serviceCatalog";
import {roleNavigation} from "./rbac";

describe("latest Canva operations parity",()=>{
 it("contains all approved service catalog entries",()=>{
   expect(serviceCatalog.map(x=>x.id)).toEqual(expect.arrayContaining(["concierge","cleaning","maintenance","laundry","minimart","restaurant","bar","rent_car","spa"]));
 });
 it("keeps service ownership and SLA metadata",()=>{
   expect(serviceCatalog.find(x=>x.id==="spa")?.owner).toBe("Spa Manager");
   expect(serviceCatalog.find(x=>x.id==="rent_car")?.sla).toBe("45 min");
 });
 it("tracks operational exceptions",()=>{
   expect(operationalExceptions).toEqual(expect.arrayContaining(["lost_found","damage_report","inventory_low","sla_breach","dnd","service_declined"]));
 });
 it("exposes new manager screens without exposing them to cleaners",()=>{
   expect(roleNavigation.general_manager).toEqual(expect.arrayContaining(["handover","exceptions","stay-card","timeline"]));
   expect(roleNavigation.cleaner).not.toContain("exceptions");
 });
});
