import {describe,expect,it} from "vitest";
import {normalizeBookingAttribution,normalizeMarketSegment} from "./booking-attribution";

describe("booking attribution",()=>{
  it("normalizes an explicit staff market segment",()=>{
    expect(normalizeBookingAttribution({
      bookingChannel:"staff_crm",
      marketSegment:" Corporate Sales ",
      source:"staff_actor"
    })).toEqual({
      bookingChannel:"staff_crm",
      marketSegment:"corporate_sales",
      source:"staff_actor"
    });
  });

  it("keeps absent segment unattributed",()=>{
    expect(normalizeMarketSegment(undefined)).toBeNull();
    expect(normalizeMarketSegment("   ")).toBeNull();
  });

  it("rejects a segment that normalizes to no usable code",()=>{
    expect(()=>normalizeMarketSegment("%%%")).toThrow("INVALID_MARKET_SEGMENT");
  });
});
