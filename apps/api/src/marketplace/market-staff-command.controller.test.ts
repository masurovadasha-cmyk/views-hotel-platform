import {describe,it,expect,vi} from "vitest";
import {MarketStaffCommandController} from "./market-staff-command.controller";
const ORG="00000000-0000-4000-8000-000000000001";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBER="30000000-0000-4000-8000-000000000001";
const PROPERTY="00000000-0000-4000-8000-000000000002";
const ORDER="70000000-0000-4000-8000-000000000001";
const ASSIGNEE="30000000-0000-4000-8000-000000000002";
const ctx=[PROPERTY,ORDER,ORG,USER,MEMBER,"request-1","key-1"] as const;
describe("V-Market internal Staff command controller",()=>{
 it("forwards a valid assignment with the authenticated actor",async()=>{
  const assign=vi.fn(async()=>({result:{orderId:ORDER,version:2},replayed:false}));
  const transition=vi.fn();
  const c=new MarketStaffCommandController({assign,transition} as never);
  const result=await c.assign(...ctx,{assigneeMembershipId:ASSIGNEE,priority:"high",dueAt:"2099-01-01T12:00:00Z",expectedVersion:1});
  expect(result.replayed).toBe(false);
  expect(assign).toHaveBeenCalledWith(
   {organizationId:ORG,userId:USER,membershipId:MEMBER,requestId:"request-1"},
   {propertyId:PROPERTY,orderId:ORDER,assigneeMembershipId:ASSIGNEE,priority:"high",dueAt:"2099-01-01T12:00:00Z",expectedVersion:1,idempotencyKey:"key-1"}
  );
 });
 it("denies missing actor and missing idempotency key",async()=>{
  const assign=vi.fn();const c=new MarketStaffCommandController({assign} as never);
  await expect(c.assign(PROPERTY,ORDER,undefined,USER,MEMBER,"r","k",{assigneeMembershipId:ASSIGNEE,priority:"normal",dueAt:"2099-01-01T12:00:00Z",expectedVersion:1})).rejects.toMatchObject({status:401});
  await expect(c.assign(PROPERTY,ORDER,ORG,USER,MEMBER,"r",undefined,{assigneeMembershipId:ASSIGNEE,priority:"normal",dueAt:"2099-01-01T12:00:00Z",expectedVersion:1})).rejects.toMatchObject({status:400});
  expect(assign).not.toHaveBeenCalled();
 });
 it("rejects invalid version, assignee and terminal action",async()=>{
  const transition=vi.fn();const assign=vi.fn();
  const c=new MarketStaffCommandController({assign,transition} as never);
  await expect(c.assign(...ctx,{assigneeMembershipId:"bad",priority:"high",dueAt:"2099-01-01T12:00:00Z",expectedVersion:1})).rejects.toMatchObject({status:400});
  await expect(c.status(...ctx,{action:"shipped",expectedVersion:1})).rejects.toMatchObject({status:400});
  await expect(c.status(...ctx,{action:"delivered",expectedVersion:0})).rejects.toMatchObject({status:400});
  expect(transition).not.toHaveBeenCalled();
 });
 it("maps permission errors to forbidden and version conflicts to conflict",async()=>{
  const assign=vi.fn(async()=>{throw Error("MARKET_DISPATCHER_FORBIDDEN")});
  const transition=vi.fn(async()=>{throw Error("MARKET_VERSION_CONFLICT")});
  const c=new MarketStaffCommandController({assign,transition} as never);
  await expect(c.assign(...ctx,{assigneeMembershipId:ASSIGNEE,priority:"high",dueAt:"2099-01-01T12:00:00Z",expectedVersion:1})).rejects.toMatchObject({status:403});
  await expect(c.status(...ctx,{action:"delivered",expectedVersion:1})).rejects.toMatchObject({status:409});
 });
});
