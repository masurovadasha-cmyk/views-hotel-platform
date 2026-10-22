import { describe, expect, it } from "vitest";
import { bookingQuote } from "./bookingQuote";
describe("bookingQuote",()=>{
  it("never invents a total without a live rate",()=>{const q=bookingQuote({nightlyRate:null,checkIn:"2026-10-12",checkOut:"2026-10-15",capacity:4,guests:2,paymentProviderConnected:true});expect(q.nights).toBe(3);expect(q.total).toBeNull();expect(q.canPay).toBe(false)});
  it("calculates only supplied rates and gates provider",()=>{const q=bookingQuote({nightlyRate:100,checkIn:"2026-10-12",checkOut:"2026-10-15",capacity:4,guests:2});expect(q.total).toBe(300);expect(q.canContinue).toBe(true);expect(q.canPay).toBe(false)});
  it("rejects invalid dates and guest count",()=>{const q=bookingQuote({nightlyRate:100,checkIn:"2026-10-15",checkOut:"2026-10-12",capacity:2,guests:3,paymentProviderConnected:true});expect(q.nights).toBe(0);expect(q.guestCountValid).toBe(false);expect(q.canContinue).toBe(false)});
});

describe('calendar date boundaries',()=>{
  it.each([
    ['2026-02-30','2026-03-03'],['2026-02-28','2026-02-30'],
    ['2026-04-31','2026-05-02'],['2026-2-01','2026-02-02'],
    ['0000-01-01','0000-01-02'],['','2026-01-02'],
    ['2026-01-01','2026-01-01'],['2026-01-02','2026-01-01'],
    ['2026-01-01T00:00:00Z','2026-01-02'],
  ])('rejects %s → %s without enabling checkout',(checkIn,checkOut)=>{
    expect(bookingQuote({nightlyRate:100,checkIn,checkOut,capacity:2,guests:1,paymentProviderConnected:true}))
      .toMatchObject({nights:0,total:null,canContinue:false,canPay:false});
  });
  it.each([
    ['2028-02-28','2028-03-01',2],['2026-12-31','2027-01-01',1],
    ['1970-01-01','1970-01-02',1],['2026-10-25','2026-10-26',1],
  ])('counts real calendar dates %s → %s',(checkIn,checkOut,nights)=>{
    expect(bookingQuote({nightlyRate:100,checkIn,checkOut,capacity:2,guests:1}))
      .toMatchObject({nights,total:100*nights,canContinue:true,canPay:false});
  });
});
