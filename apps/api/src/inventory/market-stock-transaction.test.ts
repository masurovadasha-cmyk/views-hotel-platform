import {describe,it,expect,vi} from "vitest";
import {reserveMarketStock} from "./market-stock-transaction";
const base={organizationId:"org",propertyId:"property",orderId:"order"};
describe("V-Market reservation transaction primitive",()=>{
 it("rejects malformed quantities and duplicate SKUs before SQL",async()=>{
  const query=vi.fn();
  await expect(reserveMarketStock({query} as never,{...base,lines:[{sku:"A",quantity:0}]})).rejects.toThrow("INVALID_MARKET_QUANTITY");
  await expect(reserveMarketStock({query} as never,{...base,lines:[{sku:"A",quantity:1},{sku:"A",quantity:1}]})).rejects.toThrow("DUPLICATE_SKU");
  expect(query).not.toHaveBeenCalled();
 });
 it("locks each stock row and records reservation in deterministic SKU order",async()=>{
  const calls:{sql:string;params:unknown[]}[]=[];
  const query=vi.fn(async(sql:string,params:unknown[])=>{
    calls.push({sql,params});
    if(sql.includes("SELECT id,on_hand"))return {rows:[{id:"balance",on_hand:10,reserved:0}],rowCount:1};
    return {rows:[],rowCount:1};
  });
  await reserveMarketStock({query} as never,{...base,lines:[{sku:"Z",quantity:1},{sku:"A",quantity:2}]});
  expect(calls).toHaveLength(6);
  expect(calls[0].params[2]).toBe("A");
  expect(calls[3].params[2]).toBe("Z");
  expect(calls[0].sql).toContain("FOR UPDATE");
  expect(calls[2].sql).toContain("market_stock_movements");
 });
 it("rejects insufficient stock without inserting a movement",async()=>{
  const query=vi.fn(async()=>({rows:[{id:"balance",on_hand:1,reserved:1}],rowCount:1}));
  await expect(reserveMarketStock({query} as never,{...base,lines:[{sku:"A",quantity:1}]})).rejects.toThrow("MARKET_OUT_OF_STOCK");
  expect(query).toHaveBeenCalledTimes(1);
 });
});
