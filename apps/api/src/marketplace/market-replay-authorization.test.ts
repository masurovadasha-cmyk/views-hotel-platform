import {describe,it,expect,vi} from "vitest";
import {idempotentMarketAssignment} from "./market-assignment-idempotent";
import {authorizedMarketTerminalTransition} from "./market-status-authorized";
const base={organizationId:"org",propertyId:"property",orderId:"order",actorMembershipId:"staff",idempotencyKey:"replay",expectedVersion:1};
describe("market replay authorization",()=>{
 it("denies assignment replay before idempotency lookup",async()=>{
  const query=vi.fn(async()=>({rows:[{allowed:false}],rowCount:1}));
  await expect(idempotentMarketAssignment({query} as never,{...base,assigneeMembershipId:"worker",priority:"normal",dueAt:"2099-01-01T00:00:00Z"})).rejects.toThrow("MARKET_DISPATCHER_FORBIDDEN");
  expect(query).toHaveBeenCalledTimes(1);
  expect(String((query.mock.calls as unknown[][])[0]?.[0])).toContain("organization_memberships");
 });
 it("denies status replay before idempotency lookup",async()=>{
  const query=vi.fn(async()=>({rows:[{allowed:false}],rowCount:1}));
  await expect(authorizedMarketTerminalTransition({query} as never,{...base,action:"cancelled"})).rejects.toThrow("MARKET_DISPATCHER_FORBIDDEN");
  expect(query).toHaveBeenCalledTimes(1);
 });
});
