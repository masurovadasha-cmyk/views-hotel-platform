import {describe,it,expect,vi} from "vitest";
import {transitionMarketOrder} from "./market-order-transition";
const base={organizationId:"org",propertyId:"property",orderId:"order",expectedVersion:1,action:"delivered" as const,actorMembershipId:"staff"};
describe("V-Market terminal order command",()=>{
 it("rejects invalid version before SQL",async()=>{
  const query=vi.fn();
  await expect(transitionMarketOrder({query} as never,{...base,expectedVersion:0})).rejects.toThrow("INVALID_ORDER_VERSION");
  expect(query).not.toHaveBeenCalled();
 });
 it("rejects version conflicts before stock mutations",async()=>{
  const query=vi.fn(async()=>({rows:[{status:"out_for_delivery",version:2,property_id:"property"}],rowCount:1}));
  await expect(transitionMarketOrder({query} as never,base)).rejects.toThrow("MARKET_VERSION_CONFLICT");
  expect(query).toHaveBeenCalledTimes(1);
 });
 it("rejects premature delivery",async()=>{
  const query=vi.fn(async()=>({rows:[{status:"new",version:1,property_id:"property"}],rowCount:1}));
  await expect(transitionMarketOrder({query} as never,base)).rejects.toThrow("INVALID_ORDER_TRANSITION");
  expect(query).toHaveBeenCalledTimes(1);
 });
 it("changes status only after stock movements and appends audit event",async()=>{
  const calls:string[]=[];
  const query=vi.fn(async(sql:string)=>{
   calls.push(sql);
   if(sql.includes("FROM market_service_orders"))return {rows:[{status:"out_for_delivery",version:1,property_id:"property"}],rowCount:1};
   if(sql.includes("FROM market_service_order_lines"))return {rows:[{sku:"A",quantity:1}],rowCount:1};
   if(sql.includes("FROM market_stock_balances"))return {rows:[{id:"stock",on_hand:3,reserved:1}],rowCount:1};
   return {rows:[],rowCount:1};
  });
  const result=await transitionMarketOrder({query} as never,base);
  expect(result.status).toBe("delivered");
  expect(calls.findIndex(x=>x.includes("UPDATE market_service_orders"))).toBeGreaterThan(calls.findIndex(x=>x.includes("INSERT INTO market_stock_movements")));
  expect(calls.at(-1)).toContain("market_service_events");
 });
});
