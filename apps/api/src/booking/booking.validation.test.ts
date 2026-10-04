import {describe,expect,it} from "vitest";
import {validateHoldInput,validatePriceLines} from "./booking.validation";

describe("booking hold validation",()=>{
 it("sums bigint price lines",()=>expect(validatePriceLines([
  {type:"stay",label:{en:"Stay"},amountMinor:91000000n,currency:"UZS"},
  {type:"tax",label:{en:"Tax"},amountMinor:10920000n,currency:"UZS"}
 ],"UZS")).toBe(101920000n));
 it("rejects mixed currencies",()=>expect(()=>validatePriceLines([{type:"stay",label:{en:"Stay"},amountMinor:1n,currency:"USD"}],"UZS")).toThrow("MIXED_CURRENCY"));
 it("caps hold ttl",()=>expect(()=>validateHoldInput({
  actor:{organizationId:"o",userId:"u",membershipId:"m",requestId:"r"},propertyId:"p",unitId:"u",ratePlanId:"r",
  checkInAt:"2026-10-10T14:00:00+05:00",checkOutAt:"2026-10-11T12:00:00+05:00",currency:"UZS",
  priceLines:[{type:"stay",label:{en:"Stay"},amountMinor:1n,currency:"UZS"}],idempotencyKey:"x",ttlSeconds:7200
 })).toThrow("INVALID_HOLD_TTL"));
});
