import {describe,it,expect} from "vitest";
import {BookingWorkspaceController} from "./booking-workspace.controller";
const headers={"x-organization-id":"74240000-0000-4000-8000-000000000001","x-user-id":"74240000-0000-4000-8000-000000000003","x-membership-id":"74240000-0000-4000-8000-000000000004"};
const propertyId="74240000-0000-4000-8000-000000000002";
describe("staff booking workspace read boundary",()=>{
 it("requires complete actor before touching the DB",async()=>{
  let calls=0;const controller=new BookingWorkspaceController({withActor:()=>{calls++;}} as never);
  await expect(controller.read({},propertyId)).rejects.toThrow("valid actor context required");expect(calls).toBe(0);
 });
 it("rejects malformed property IDs before DB use",async()=>{
  const controller=new BookingWorkspaceController({withActor:()=>{throw Error("DB_MUST_NOT_RUN");}} as never);
  await expect(controller.read(headers,"not-a-uuid")).rejects.toThrow("INVALID_PROPERTY_ID");
 });
 it("checks permission and property scope before reading rows",async()=>{
  const queries:string[]=[];
  const controller=new BookingWorkspaceController({withActor:async(_actor:unknown,work:(c:unknown)=>unknown)=>work({query:async(sql:string)=>{queries.push(sql);return {rows:[{allowed:false}]};}})} as never);
  await expect(controller.read(headers,propertyId)).rejects.toThrow("PROPERTY_FORBIDDEN");
  expect(queries).toHaveLength(2);expect(queries[1]).toContain("reservation.read");expect(queries[1]).toContain("app.can_access_property");
 });
});
