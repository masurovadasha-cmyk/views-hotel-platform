import {describe,it,expect,vi} from "vitest";
import {fetchStaffOrderDetail,parseStaffOrderDetail,StaffGatewayError} from "./marketStaffGateway";
const P="00000000-0000-4000-8000-000000000001",O="00000000-0000-4000-8000-000000000002";
const detail={order:{id:O,property_id:P,unit_id:null,status:"new",payment_status:"unpaid",total_minor:"12500",subtotal_minor:"10000",delivery_minor:"2500",delivery_slot:"now",guest_comment:"",version:1,created_at:"2026-10-09T10:00:00Z",updated_at:"2026-10-09T10:00:00Z"},lines:[{sku:"A",product_name_snapshot:"Water",quantity:2,unit_price_minor:"5000",line_total_minor:"10000"}],assignment:null,events:[]};
describe("VIEWS staff gateway adapter",()=>{
 it("fails closed without trusted gateway configuration",async()=>{
  const fetcher=vi.fn();
  await expect(fetchStaffOrderDetail(P,O,{gatewayEnabled:false,fetcher:fetcher as never})).rejects.toMatchObject({status:503});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("only calls same-origin gateway without internal auth headers",async()=>{
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>detail}));
  const result=await fetchStaffOrderDetail(P,O,{gatewayEnabled:true,fetcher:fetcher as never});
  expect(result.order.id).toBe(O);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [path,opts]=fetcher.mock.calls[0] as unknown as [string,{credentials:string;headers:Record<string,string>}];
  expect(path).toBe("/api/staff/market/properties/"+P+"/orders/"+O);
  expect(opts.credentials).toBe("same-origin");
  expect(opts.headers).toEqual({Accept:"application/json"});
 });
 it("uses local property IDs that the BFF resolves to scoped Core UUIDs",async()=>{
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>detail}));
  const result=await fetchStaffOrderDetail("utower",O,{gatewayEnabled:true,fetcher:fetcher as never});
  expect(result.order.property_id).toBe(P);
  expect((fetcher.mock.calls as unknown as [string,unknown][])[0][0]).toBe("/api/staff/market/properties/utower/orders/"+O);
 });
 it("rejects unsafe local property paths",async()=>{
  const fetcher=vi.fn();
  for(const property of ["../internal","nest/one","a?b","", "x".repeat(81)]){
   await expect(fetchStaffOrderDetail(property,O,{gatewayEnabled:true,fetcher:fetcher as never})).rejects.toMatchObject({status:400});
  }
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("rejects malformed ids before any request",async()=>{
  const fetcher=vi.fn();
  await expect(fetchStaffOrderDetail("../internal",O,{gatewayEnabled:true,fetcher:fetcher as never})).rejects.toMatchObject({status:400});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("preserves forbidden status without leaking internal details",async()=>{
  const fetcher=vi.fn(async()=>({ok:false,status:403}));
  await expect(fetchStaffOrderDetail(P,O,{gatewayEnabled:true,fetcher:fetcher as never})).rejects.toMatchObject({status:403,message:"STAFF_FORBIDDEN"});
 });
 it("rejects corrupted totals and line prices",()=>{
  expect(()=>parseStaffOrderDetail({...detail,order:{...detail.order,total_minor:"12501"}})).toThrow(StaffGatewayError);
  expect(()=>parseStaffOrderDetail({...detail,lines:[{...detail.lines[0],quantity:3}]})).toThrow(StaffGatewayError);
  expect(()=>parseStaffOrderDetail({...detail,events:Array.from({length:201},()=>({action:"x",details:{},created_at:"now"}))})).toThrow(StaffGatewayError);
 });
});
