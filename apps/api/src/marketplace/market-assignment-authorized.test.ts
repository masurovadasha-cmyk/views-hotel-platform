import {describe,it,expect,vi} from "vitest";
import {authorizedMarketAssignment} from "./market-assignment-authorized";
const input={organizationId:"org",propertyId:"property",orderId:"order",actorMembershipId:"manager",assigneeMembershipId:"worker",priority:"normal" as const,dueAt:"2099-01-01T00:00:00Z",expectedVersion:1};
describe("authorized market assignment",()=>{
 it("rejects unprivileged dispatcher before touching order",async()=>{
  const query=vi.fn(async()=>({rows:[{allowed:false}],rowCount:1}));
  await expect(authorizedMarketAssignment({query} as never,input)).rejects.toThrow("MARKET_DISPATCHER_FORBIDDEN");
  expect(query).toHaveBeenCalledTimes(1);
 });
 it("checks membership and property scope in permission query",async()=>{
  const query=vi.fn(async()=>({rows:[{allowed:false}],rowCount:1}));
  await expect(authorizedMarketAssignment({query} as never,input)).rejects.toThrow();
  const sql=String((query.mock.calls as unknown[][])[0]?.[0]);
  expect(sql).toContain("m.organization_id=$2");
  expect(sql).toContain("app.can_access_property($3::uuid)");
  expect(sql).toContain("m.status='active'");
 });
});
