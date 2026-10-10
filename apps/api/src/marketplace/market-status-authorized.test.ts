import {describe,it,expect,vi} from "vitest";
import {authorizedMarketTerminalTransition} from "./market-status-authorized";
const input={organizationId:"org",propertyId:"property",orderId:"order",expectedVersion:1,action:"delivered" as const,actorMembershipId:"staff",idempotencyKey:"key"};
describe("authorized market status command",()=>{
 it("denies unprivileged dispatcher before idempotency or stock queries",async()=>{
  const query=vi.fn(async()=>({rows:[{allowed:false}],rowCount:1}));
  await expect(authorizedMarketTerminalTransition({query} as never,input)).rejects.toThrow("MARKET_DISPATCHER_FORBIDDEN");
  expect(query).toHaveBeenCalledTimes(1);
 });
 it("checks active membership, organization and property",async()=>{
  const query=vi.fn(async()=>({rows:[{allowed:false}],rowCount:1}));
  await expect(authorizedMarketTerminalTransition({query} as never,input)).rejects.toThrow();
  const sql=String((query.mock.calls as unknown[][])[0]?.[0]);
  expect(sql).toContain("m.status='active'");
  expect(sql).toContain("m.organization_id=$2");
  expect(sql).toContain("app.can_access_property($3::uuid)");
 });
});
