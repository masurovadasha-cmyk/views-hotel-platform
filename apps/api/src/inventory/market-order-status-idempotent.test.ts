import {describe,it,expect,vi} from "vitest";
import {idempotentMarketTerminalTransition} from "./market-order-status-idempotent";
const input={
 organizationId:"org",propertyId:"property",orderId:"order",
 expectedVersion:1,action:"delivered" as const,
 actorMembershipId:"staff",idempotencyKey:"request-1"
};
describe("idempotent market terminal transition",()=>{
 it("rejects missing key before SQL",async()=>{
  const query=vi.fn();
  await expect(idempotentMarketTerminalTransition({query} as never,{...input,idempotencyKey:""})).rejects.toThrow("INVALID_MARKET_IDEMPOTENCY_KEY");
  expect(query).not.toHaveBeenCalled();
 });
 it("does not run stock mutation for changed-key replay",async()=>{
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("SELECT request_hash"))return {rows:[{request_hash:"different",order_id:"order",result:{version:2}}]};
   return {rows:[],rowCount:1};
  });
  await expect(idempotentMarketTerminalTransition({query} as never,input)).rejects.toThrow("MARKET_IDEMPOTENCY_CONFLICT");
  expect(query.mock.calls.some(c=>String(c[0]).includes("market_stock_balances"))).toBe(false);
 });
});
