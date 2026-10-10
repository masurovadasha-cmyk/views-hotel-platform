import {describe,it,expect,vi} from "vitest";
import {MarketStaffReadService} from "./market-staff-read.service";
const actor={organizationId:"org",userId:"user",membershipId:"membership",requestId:"request"};
describe("market staff read service",()=>{
 it("checks property scope before selecting orders",async()=>{
  const calls:string[]=[];
  const query=vi.fn(async(sql:string)=>{
   calls.push(sql);
   if(sql.includes("can_access_property"))return {rows:[{allowed:true}]};
   return {rows:[{id:"order",status:"new"}]};
  });
  const db={withActor:vi.fn(async(_actor:unknown,work:(client:unknown)=>Promise<unknown>)=>work({query}))};
  const service=new MarketStaffReadService(db as never);
  const rows=await service.listOrders(actor,"property",20);
  expect(rows).toHaveLength(1);
  expect(calls[0]).toContain("can_access_property");
  expect(calls[1]).toContain("organization_id=$1 AND property_id=$2");
 });
 it("denies unscoped properties before querying orders",async()=>{
  const query=vi.fn(async()=>({rows:[{allowed:false}]}));
  const db={withActor:vi.fn(async(_actor:unknown,work:(client:unknown)=>Promise<unknown>)=>work({query}))};
  await expect(new MarketStaffReadService(db as never).listOrders(actor,"other")).rejects.toThrow("MARKET_PROPERTY_FORBIDDEN");
  expect(query).toHaveBeenCalledTimes(1);
 });
 it("limits result sizes",async()=>{
  const db={withActor:vi.fn()};
  await expect(new MarketStaffReadService(db as never).listOrders(actor,"property",101)).rejects.toThrow("INVALID_MARKET_LIMIT");
  expect(db.withActor).not.toHaveBeenCalled();
 });
});
