import { describe,expect,it } from "vitest";
import { validateGuestRequest } from "./guestRequest";
describe("guest request validation",()=>{
  it("accepts a stay-linked concierge request",()=>expect(validateGuestRequest({reservationId:"r1",category:"concierge",title:"Airport transfer",details:"Pickup at 14:00"}).valid).toBe(true));
  it("rejects maintenance as a guest service category",()=>expect(validateGuestRequest({reservationId:"r1",category:"maintenance",title:"AC",details:"Please check"}).errors).toContain("category_not_allowed"));
  it("requires a reservation",()=>expect(validateGuestRequest({reservationId:"",category:"cleaning",title:"Cleaning",details:"Tomorrow"}).errors).toContain("reservation_required"));
});
