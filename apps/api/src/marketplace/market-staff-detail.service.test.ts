import {describe,it,expect,vi} from "vitest";
import {MarketStaffReadService} from "./market-staff-read.service";
const actor={organizationId:"org",userId:"user",membershipId:"member",requestId:"req"};
describe("market staff order detail",()=>{
 it("loads order, lines, assignment and events after scope and role checks",async()=>{
  const calls:string[]=[];
  const query=vi.fn(async(sql:string)=>{
   calls.push(sql);
   if(sql.includes("can_access_property"))return {rows:[{allowed:true}]};
   if(sql.includes("organization_memberships"))return {rows:[{allowed:true}]};
   if(sql.includes("FROM market_service_orders"))return {rows:[{id:"order"}]};
   if(sql.includes("FROM market_service_order_lines"))return {rows:[{sku:"VM-0001",quantity:1}]};
   if(sql.includes("FROM market_service_assignments"))return {rows:[{priority:"normal"}]};
   if(sql.includes("FROM market_service_events"))return {rows:[{action:"created"}]};
   return {rows:[]};
  });
  const db={withActor:vi.fn(async(_actor:unknown,work:(client:unknown)=>Promise<unknown>)=>work({query}))};
  const result=await new MarketStaffReadService(db as never).orderDetail(actor,"property","order");
  expect(result.order).toMatchObject({id:"order"});
  expect(result.lines).toHaveLength(1);
  expect(result.events).toHaveLength(1);
  expect(calls[0]).toContain("can_access_property");
  expect(calls[1]).toContain("organization_memberships");
 });
 it("does not disclose order existence to a forbidden role",async()=>{
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("can_access_property"))return {rows:[{allowed:true}]};
   if(sql.includes("organization_memberships"))return {rows:[{allowed:false}]};
   throw Error("ORDER_LOOKUP_MUST_NOT_RUN");
  });
  const db={withActor:vi.fn(async(_actor:unknown,work:(client:unknown)=>Promise<unknown>)=>work({query}))};
  await expect(new MarketStaffReadService(db as never).orderDetail(actor,"property","order")).rejects.toThrow("MARKET_ROLE_FORBIDDEN");
  expect(query).toHaveBeenCalledTimes(2);
 });
 it("does not query detail when property access is missing",async()=>{
  const query=vi.fn(async()=>({rows:[{allowed:false}]}));
  const db={withActor:vi.fn(async(_actor:unknown,work:(client:unknown)=>Promise<unknown>)=>work({query}))};
  await expect(new MarketStaffReadService(db as never).orderDetail(actor,"other","order")).rejects.toThrow("MARKET_PROPERTY_FORBIDDEN");
  expect(query).toHaveBeenCalledTimes(1);
 });
});
