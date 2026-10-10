import {describe,expect,it} from "vitest";
import {calculateCancellationRefund,type CancellationPolicySnapshot} from "./cancellation";

const policy:CancellationPolicySnapshot={
  version:1,
  propertyTimezone:"Asia/Tashkent",
  rules:[
    {minHoursBeforeCheckIn:72,refundBps:10000},
    {minHoursBeforeCheckIn:24,refundBps:5000},
    {minHoursBeforeCheckIn:0,refundBps:0}
  ],
  nonRefundableLineCodes:["service_fee"]
};
const lines=[
  {code:"night:1",amountMinor:10000000n,refundable:true},
  {code:"promo",amountMinor:-1000000n,refundable:true},
  {code:"service_fee",amountMinor:500000n,refundable:false}
].map(({code,amountMinor,refundable})=>({code,amountMinor,refundable}));

describe("cancellation calculator",()=>{
  it("returns full eligible amount before 72 hours",()=>{
    const result=calculateCancellationRefund({
      policy,requestedAt:"2026-10-01T12:00:00+05:00",checkInAt:"2026-10-10T14:00:00+05:00",lines
    });
    expect(result.refundBps).toBe(10000);
    expect(result.eligibleMinor).toBe(9000000n);
    expect(result.refundMinor).toBe(9000000n);
  });
  it("returns 50% in the configured middle window",()=>{
    const result=calculateCancellationRefund({
      policy,requestedAt:"2026-10-09T12:00:00+05:00",checkInAt:"2026-10-10T14:00:00+05:00",lines
    });
    expect(result.refundBps).toBe(5000);
    expect(result.refundMinor).toBe(4500000n);
  });
  it("returns zero after check-in",()=>{
    const result=calculateCancellationRefund({
      policy,requestedAt:"2026-10-10T15:00:00+05:00",checkInAt:"2026-10-10T14:00:00+05:00",lines
    });
    expect(result.refundMinor).toBe(0n);
  });
});
