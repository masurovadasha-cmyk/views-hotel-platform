import {describe,it,expect,vi} from "vitest";
import {createMarketOrderInTransaction} from "./market-checkout-transaction";

const base={organizationId:"org",propertyId:"property",unitId:null,actorUserId:"user",idempotencyKey:"key",deliverySlot:"now",comment:"",lines:[{sku:"A",quantity:2}]};

describe("V-Market internal checkout transaction",()=>{
 it("rejects malformed quantities before querying",async()=>{
  const query=vi.fn();
  await expect(createMarketOrderInTransaction({query} as never,{...base,lines:[{sku:"A",quantity:0}]})).rejects.toThrow("INVALID_MARKET_QUANTITY");
  expect(query).not.toHaveBeenCalled();
 });
 it("replays an identical command without reserving stock again",async()=>{
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("FROM market_service_orders"))return {rows:[{id:"existing",request_hash:"bad",status:"new"}],rowCount:1};
   return {rows:[],rowCount:1};
  });
  await expect(createMarketOrderInTransaction({query} as never,base)).rejects.toThrow("MARKET_IDEMPOTENCY_CONFLICT");
  expect(query).toHaveBeenCalledTimes(2);
 });
 it("denies property access before reading catalog prices",async()=>{
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("can_access_property"))return {rows:[{allowed:false}],rowCount:1};
   return {rows:[],rowCount:0};
  });
  await expect(createMarketOrderInTransaction({query} as never,base)).rejects.toThrow("MARKET_PROPERTY_FORBIDDEN");
  expect(query.mock.calls.some(call=>String(call[0]).includes("market_catalog_prices"))).toBe(false);
 });
 it("refuses unknown catalog products before inserting an order",async()=>{
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("can_access_property"))return {rows:[{allowed:true}],rowCount:1};
   return {rows:[],rowCount:0};
  });
  await expect(createMarketOrderInTransaction({query} as never,base)).rejects.toThrow("MARKET_PRICE_NOT_FOUND");
  expect(query.mock.calls.some(call=>String(call[0]).includes("INSERT INTO market_service_orders"))).toBe(false);
 });
});
