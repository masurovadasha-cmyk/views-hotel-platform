import {describe,it,expect,vi} from "vitest";
import {validateMarketAssignee} from "./market-assignee-access";
const base={organizationId:"org",propertyId:"property",assigneeMembershipId:"membership"};
describe("market staff assignee scope",()=>{
 it("accepts an active membership scoped to the property",async()=>{
  const query=vi.fn(async()=>({rows:[{allowed:true}],rowCount:1}));
  await expect(validateMarketAssignee({query} as never,base)).resolves.toBeUndefined();
  expect(query).toHaveBeenCalledTimes(1);
 });
 it("rejects inactive, foreign or unscoped membership",async()=>{
  const query=vi.fn(async()=>({rows:[{allowed:false}],rowCount:1}));
  await expect(validateMarketAssignee({query} as never,base)).rejects.toThrow("MARKET_ASSIGNEE_FORBIDDEN");
 });
 it("checks both organization and property scope",async()=>{
  const query=vi.fn(async()=>({rows:[],rowCount:0}));
  await expect(validateMarketAssignee({query} as never,base)).rejects.toThrow();
  const sql=String((query.mock.calls as unknown[][])[0]?.[0]);
  expect(sql).toContain("m.organization_id=$2");
  expect(sql).toContain("s.property_id=$3");
  expect(sql).toContain("m.status='active'");
 });
});
