import {describe,it,expect,vi} from "vitest";
import {assignMarketOrderInTransaction} from "./market-assignment-transaction";
const base={organizationId:"org",propertyId:"property",orderId:"order",actorMembershipId:"manager",assigneeMembershipId:"worker",priority:"high" as const,dueAt:"2099-01-01T12:00:00Z",expectedVersion:1};
describe("market assignment command",()=>{
 it("rejects invalid version before SQL",async()=>{
  const query=vi.fn();
  await expect(assignMarketOrderInTransaction({query} as never,{...base,expectedVersion:0})).rejects.toThrow("INVALID_ORDER_VERSION");
  expect(query).not.toHaveBeenCalled();
 });
 it("rejects closed orders without assigning",async()=>{
  const query=vi.fn(async()=>({rows:[{property_id:"property",status:"delivered",version:1}],rowCount:1}));
  await expect(assignMarketOrderInTransaction({query} as never,base)).rejects.toThrow("MARKET_ORDER_TERMINAL");
  expect(query).toHaveBeenCalledTimes(1);
 });
 it("rejects foreign or inactive assignees before writing",async()=>{
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("FROM market_service_orders"))return {rows:[{property_id:"property",status:"new",version:1}],rowCount:1};
   return {rows:[{allowed:false}],rowCount:1};
  });
  await expect(assignMarketOrderInTransaction({query} as never,base)).rejects.toThrow("MARKET_ASSIGNEE_FORBIDDEN");
  expect(query.mock.calls.some(c=>String(c[0]).includes("INSERT INTO market_service_assignments"))).toBe(false);
 });
 it("writes assignment, increments version and appends audit event",async()=>{
  const calls:string[]=[];
  const query=vi.fn(async(sql:string)=>{
   calls.push(sql);
   if(sql.includes("FROM market_service_orders"))return {rows:[{property_id:"property",status:"new",version:1}],rowCount:1};
   if(sql.includes("SELECT EXISTS"))return {rows:[{allowed:true}],rowCount:1};
   return {rows:[],rowCount:1};
  });
  const result=await assignMarketOrderInTransaction({query} as never,base);
  expect(result.version).toBe(2);
  expect(calls.at(-1)).toContain("market_service_events");
  expect(calls.some(s=>s.includes("ON CONFLICT(order_id)"))).toBe(true);
 });
});
