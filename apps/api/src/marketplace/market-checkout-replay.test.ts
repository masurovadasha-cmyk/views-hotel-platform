import {describe,it,expect,vi} from "vitest";
import {createHash} from "node:crypto";
import {createMarketOrderInTransaction} from "./market-checkout-transaction";
const base={organizationId:"org",propertyId:"property",unitId:null,actorUserId:"user",idempotencyKey:"key",deliverySlot:"now",comment:"",lines:[{sku:"A",quantity:2}]};
describe("V-Market checkout replay",()=>{
 it("replays matching payload without touching stock",async()=>{
  const hash=createHash("sha256").update(JSON.stringify({propertyId:"property",unitId:null,deliverySlot:"now",comment:"",lines:[{sku:"A",quantity:2}]})).digest("hex");
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("app.can_access_property"))return {rows:[{allowed:true}],rowCount:1};
   if(sql.includes("FROM market_service_orders"))return {rows:[{id:"existing",request_hash:hash,status:"new"}],rowCount:1};
   return {rows:[],rowCount:1};
  });
  const result=await createMarketOrderInTransaction({query} as never,base);
  expect(result).toEqual({orderId:"existing",status:"new",idempotentReplay:true});
  expect(query).toHaveBeenCalledTimes(3);
 });
 it("denies replay before revealing an existing order when property access is revoked",async()=>{
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("app.can_access_property"))return {rows:[{allowed:false}],rowCount:1};
   throw Error("UNAUTHORIZED_ORDER_LOOKUP");
  });
  await expect(createMarketOrderInTransaction({query} as never,base)).rejects.toThrow("MARKET_PROPERTY_FORBIDDEN");
  expect(query).toHaveBeenCalledTimes(1);
 });
 it("canonicalizes SKU order in the idempotency hash",async()=>{
  const lines=[{sku:"B",quantity:1},{sku:"A",quantity:2}];
  const canonical=[{sku:"A",quantity:2},{sku:"B",quantity:1}];
  const hash=createHash("sha256").update(JSON.stringify({propertyId:"property",unitId:null,deliverySlot:"now",comment:"",lines:canonical})).digest("hex");
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("app.can_access_property"))return {rows:[{allowed:true}],rowCount:1};
   if(sql.includes("FROM market_service_orders"))return {rows:[{id:"existing",request_hash:hash,status:"picking"}],rowCount:1};
   return {rows:[],rowCount:1};
  });
  const result=await createMarketOrderInTransaction({query} as never,{...base,lines});
  expect(result.idempotentReplay).toBe(true);
  expect(result.status).toBe("picking");
 });
});
