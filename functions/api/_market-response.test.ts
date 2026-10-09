import {describe,expect,it} from "vitest";
import {validateCoreMarketDetail} from "./_market-response";
const P="00000000-0000-4000-8000-000000000001",O="00000000-0000-4000-8000-000000000002";
const detail=()=>({order:{id:O,property_id:P,unit_id:null,status:"new",payment_status:"unpaid",total_minor:"12500",subtotal_minor:"10000",delivery_minor:"2500",delivery_slot:"now",guest_comment:"",version:1,created_at:"2026-10-09T10:00:00Z",updated_at:"2026-10-09T10:00:00Z"},lines:[{sku:"VM-0001",product_name_snapshot:"Water",quantity:2,unit_price_minor:"5000",line_total_minor:"10000"}],assignment:null,events:[]});
describe("Core V-Market response boundary",()=>{
 it("accepts a valid scoped order",()=>expect(validateCoreMarketDetail(detail(),P,O)).toBe(true));
 it("rejects order or property substitution",()=>{
  expect(validateCoreMarketDetail(detail(),P,"00000000-0000-4000-8000-000000000003")).toBe(false);
  expect(validateCoreMarketDetail(detail(),"00000000-0000-4000-8000-000000000003",O)).toBe(false);
 });
 it("rejects invalid totals, quantities and duplicated SKUs",()=>{
  const a=detail();a.order.total_minor="12501";expect(validateCoreMarketDetail(a,P,O)).toBe(false);
  const b=detail();b.lines[0].quantity=3;expect(validateCoreMarketDetail(b,P,O)).toBe(false);
  const c=detail();c.lines.push({...c.lines[0]});expect(validateCoreMarketDetail(c,P,O)).toBe(false);
 });
 it("rejects malformed or oversized event collections",()=>{
  expect(validateCoreMarketDetail({...detail(),events:Array.from({length:201},()=>({action:"x",details:{},created_at:"now"}))},P,O)).toBe(false);
  expect(validateCoreMarketDetail({...detail(),events:[{action:"x",details:null,created_at:"now"}]},P,O)).toBe(false);
 });
});
