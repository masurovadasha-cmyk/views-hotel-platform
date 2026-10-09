import {afterEach,describe,it,expect,vi} from "vitest";
import {fetchStaffMarketOrders} from "./staffMarketApi";
afterEach(()=>vi.restoreAllMocks());
describe("Staff CRM Core orders client",()=>{
 it("loads orders with same-origin credentials and a scoped property",async()=>{
  const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(new Response(JSON.stringify({orders:[{id:"order",status:"new"}]}),{status:200}));
  const orders=await fetchStaffMarketOrders("utower");
  expect(orders).toHaveLength(1);
  expect(fetchMock.mock.calls[0][0]).toContain("propertyId=utower");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({credentials:"same-origin"});
 });
 it("rejects missing property without network access",async()=>{
  const fetchMock=vi.spyOn(globalThis,"fetch");
  await expect(fetchStaffMarketOrders(" ")).rejects.toThrow("PROPERTY_REQUIRED");
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it("maps unauthorized and forbidden responses",async()=>{
  vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(new Response("",{status:401})).mockResolvedValueOnce(new Response("",{status:403}));
  await expect(fetchStaffMarketOrders("utower")).rejects.toThrow("STAFF_AUTH_REQUIRED");
  await expect(fetchStaffMarketOrders("utower")).rejects.toThrow("PROPERTY_FORBIDDEN");
 });
 it("rejects malformed server data",async()=>{
  vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(new Response(JSON.stringify({orders:null}),{status:200}));
  await expect(fetchStaffMarketOrders("utower")).rejects.toThrow("CORE_INVALID_RESPONSE");
 });
});
