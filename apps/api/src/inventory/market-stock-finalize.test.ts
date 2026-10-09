import {describe,it,expect,vi} from "vitest";
import {finalizeMarketStock} from "./market-stock-finalize";
const base={organizationId:"org",propertyId:"property",orderId:"order"};
describe("V-Market terminal stock mutation",()=>{
 it("rejects invalid requests without touching the database",async()=>{
  const query=vi.fn();
  await expect(finalizeMarketStock({query} as never,{...base,action:"cancelled",lines:[{sku:"A",quantity:0}]})).rejects.toThrow("INVALID_MARKET_QUANTITY");
  await expect(finalizeMarketStock({query} as never,{...base,action:"delivered",lines:[{sku:"A",quantity:1},{sku:"A",quantity:1}]})).rejects.toThrow("DUPLICATE_SKU");
  expect(query).not.toHaveBeenCalled();
 });
 for(const action of ["delivered","cancelled"] as const){
  it(action+" locks, adjusts stock and appends exactly one movement",async()=>{
   const calls:{sql:string;params:unknown[]}[]=[];
   const query=vi.fn(async(sql:string,params:unknown[])=>{
    calls.push({sql,params});
    return sql.includes("SELECT id,on_hand")?{rows:[{id:"balance",on_hand:5,reserved:3}],rowCount:1}:{rows:[],rowCount:1};
   });
   await finalizeMarketStock({query} as never,{...base,action,lines:[{sku:"A",quantity:2}]});
   expect(calls).toHaveLength(3);
   expect(calls[0].sql).toContain("FOR UPDATE");
   expect(calls[1].params[0]).toBe(action==="delivered"?-2:0);
   expect(calls[2].params[3]).toBe(action==="delivered"?"sale":"release");
  });
 }
 it("rejects missing reservation without a stock update",async()=>{
  const query=vi.fn(async()=>({rows:[{id:"balance",on_hand:5,reserved:0}],rowCount:1}));
  await expect(finalizeMarketStock({query} as never,{...base,action:"delivered",lines:[{sku:"A",quantity:1}]})).rejects.toThrow("MARKET_RESERVATION_CONFLICT");
  expect(query).toHaveBeenCalledTimes(1);
 });
});
