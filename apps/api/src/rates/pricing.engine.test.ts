import {describe,expect,it} from "vitest";
import {priceStay} from "./pricing.engine";
import type {PricingInput} from "./pricing.types";

function base(overrides:Partial<PricingInput>={}):PricingInput{
  return {
    checkInAt:"2026-10-10T14:00:00+05:00",
    checkOutAt:"2026-10-12T12:00:00+05:00",
    propertyTimezone:"Asia/Tashkent",
    bookedAt:"2026-10-01T10:00:00+05:00",
    currency:"UZS",
    baseNightlyMinor:10000000n,
    dayOverrides:[],
    weekdayRules:[],
    adjustments:[],
    charges:[],
    guests:[{age:35,residency:"resident"}],
    ...overrides
  };
}

describe("pricing engine",()=>{
  it("applies weekday pricing and lets a day override win",()=>{
    const result=priceStay(base({
      weekdayRules:[{
        isoWeekday:6,nightlyMinor:null,priceDeltaBps:2000,minStay:null,
        closed:false,closedToArrival:false,closedToDeparture:false
      }],
      dayOverrides:[{
        stayDate:"2026-10-10",nightlyMinor:15000000n,minStay:null,
        closed:false,closedToArrival:false,closedToDeparture:false
      }]
    }));
    expect(result.nights).toBe(2);
    expect(result.accommodationMinor).toBe(25000000n);
  });

  it("enforces minimum stay and arrival restrictions",()=>{
    expect(()=>priceStay(base({
      dayOverrides:[{
        stayDate:"2026-10-10",nightlyMinor:null,minStay:3,
        closed:false,closedToArrival:false,closedToDeparture:false
      }]
    }))).toThrow("MIN_STAY_NOT_MET");

    expect(()=>priceStay(base({
      dayOverrides:[{
        stayDate:"2026-10-10",nightlyMinor:null,minStay:null,
        closed:false,closedToArrival:true,closedToDeparture:false
      }]
    }))).toThrow("CLOSED_TO_ARRIVAL");
  });

  it("applies a qualifying last-minute discount",()=>{
    const result=priceStay(base({
      bookedAt:"2026-10-09T10:00:00+05:00",
      adjustments:[{
        code:"LAST_MINUTE_10",triggerKind:"last_minute",adjustmentKind:"percentage",
        amountBps:1000,amountMinor:null,minNights:null,minDaysBeforeArrival:0,maxDaysBeforeArrival:2,
        priority:10,stackable:false,effectiveFrom:null,effectiveTo:null
      }]
    }));
    expect(result.accommodationMinor).toBe(20000000n);
    expect(result.discountMinor).toBe(2000000n);
    expect(result.totalMinor).toBe(18000000n);
  });

  it("uses configured guest-night and percentage charges",()=>{
    const result=priceStay(base({
      guests:[
        {age:35,residency:"resident"},
        {age:17,residency:"nonresident"},
        {age:12,residency:"nonresident"}
      ],
      charges:[
        {
          code:"TEST_TAX",label:{en:"Test tax"},ruleKind:"percent_of_accommodation",
          rateBps:1200,amountMinor:null,currency:null,residency:"all",minAge:null
        },
        {
          code:"TEST_TOURIST_FEE",label:{en:"Test guest fee"},ruleKind:"fixed_per_guest_night",
          rateBps:null,amountMinor:100000n,currency:"UZS",residency:"nonresident",minAge:16
        }
      ]
    }));
    expect(result.chargesMinor).toBe(2600000n);
    expect(result.totalMinor).toBe(22600000n);
  });

  it("counts local nights correctly across a Europe DST change",()=>{
    const result=priceStay(base({
      checkInAt:"2026-10-24T15:00:00+02:00",
      checkOutAt:"2026-10-26T11:00:00+01:00",
      propertyTimezone:"Europe/Berlin",
      bookedAt:"2026-10-01T10:00:00+02:00"
    }));
    expect(result.nights).toBe(2);
  });
});
