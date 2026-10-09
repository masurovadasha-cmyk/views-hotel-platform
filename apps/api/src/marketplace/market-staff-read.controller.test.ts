import {describe,it,expect,vi} from "vitest";
import {MarketStaffReadController} from "./market-staff-read.controller";
const ORG="00000000-0000-4000-8000-000000000001";
const USER="00000000-0000-4000-8000-000000000002";
const MEMBER="00000000-0000-4000-8000-000000000003";
const PROPERTY="00000000-0000-4000-8000-000000000004";
describe("internal V-Market Staff CRM read controller",()=>{
 it("returns only service-scoped orders",async()=>{
  const listOrders=vi.fn(async()=>[{id:"order",status:"new"}]);
  const controller=new MarketStaffReadController({listOrders} as never);
  const result=await controller.list(PROPERTY,ORG,USER,MEMBER,"request",undefined);
  expect(result.orders).toHaveLength(1);
  expect(listOrders).toHaveBeenCalledTimes(1);
  expect(listOrders.mock.calls[0]).toBeDefined();
 });
 it("rejects missing trusted actor fields before service invocation",async()=>{
  const listOrders=vi.fn();
  const controller=new MarketStaffReadController({listOrders} as never);
  await expect(controller.list(PROPERTY,undefined,USER,MEMBER,"request",undefined)).rejects.toThrow();
  expect(listOrders).not.toHaveBeenCalled();
 });
 it("rejects oversized or invalid limit",async()=>{
  const listOrders=vi.fn();
  const controller=new MarketStaffReadController({listOrders} as never);
  await expect(controller.list(PROPERTY,ORG,USER,MEMBER,"request","101")).rejects.toThrow();
  await expect(controller.list(PROPERTY,ORG,USER,MEMBER,"request","1.5")).rejects.toThrow();
  expect(listOrders).not.toHaveBeenCalled();
 });
 it("returns HTTP 404 for an inaccessible or nonexistent order after authorization",async()=>{
  const orderDetail=vi.fn(async()=>{throw Error("MARKET_ORDER_NOT_FOUND")});
  const controller=new MarketStaffReadController({orderDetail} as never);
  await expect(controller.detail(PROPERTY,"00000000-0000-4000-8000-000000000005",ORG,USER,MEMBER,"request")).rejects.toMatchObject({status:404});
 });
 it("rejects malformed detail order identifiers",async()=>{
  const orderDetail=vi.fn();
  const controller=new MarketStaffReadController({orderDetail} as never);
  await expect(controller.detail(PROPERTY,"not-uuid",ORG,USER,MEMBER,"request")).rejects.toThrow();
  expect(orderDetail).not.toHaveBeenCalled();
 });
 it("maps staff role denial to forbidden response",async()=>{
  const listOrders=vi.fn(async()=>{throw Error("MARKET_ROLE_FORBIDDEN")});
  const controller=new MarketStaffReadController({listOrders} as never);
  await expect(controller.list(PROPERTY,ORG,USER,MEMBER,"request","10")).rejects.toMatchObject({status:403});
 });
 it("maps property access denial to forbidden response",async()=>{
  const listOrders=vi.fn(async()=>{throw Error("MARKET_PROPERTY_FORBIDDEN")});
  const controller=new MarketStaffReadController({listOrders} as never);
  await expect(controller.list(PROPERTY,ORG,USER,MEMBER,"request","10")).rejects.toMatchObject({status:403});
 });
});
