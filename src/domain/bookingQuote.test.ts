import { describe, expect, it } from "vitest";
import { bookingQuote } from "./bookingQuote";
describe("bookingQuote",()=>{
  it("never invents a total without a live rate",()=>{const q=bookingQuote({nightlyRate:null,checkIn:"2026-10-12",checkOut:"2026-10-15",capacity:4,guests:2,paymentProviderConnected:true});expect(q.nights).toBe(3);expect(q.total).toBeNull();expect(q.canPay).toBe(false)});
  it("calculates only supplied rates and gates provider",()=>{const q=bookingQuote({nightlyRate:100,checkIn:"2026-10-12",checkOut:"2026-10-15",capacity:4,guests:2});expect(q.total).toBe(300);expect(q.canContinue).toBe(true);expect(q.canPay).toBe(false)});
  it("rejects invalid dates and guest count",()=>{const q=bookingQuote({nightlyRate:100,checkIn:"2026-10-15",checkOut:"2026-10-12",capacity:2,guests:3,paymentProviderConnected:true});expect(q.nights).toBe(0);expect(q.guestCountValid).toBe(false);expect(q.canContinue).toBe(false)});
});
