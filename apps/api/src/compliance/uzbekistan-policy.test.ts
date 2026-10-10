import {describe,expect,it} from "vitest";
import {
  defaultProductDocumentStorageRegion,isGuestFeeEligible,
  registrationDueAt,residencyScope
} from "./uzbekistan-policy";

describe("Uzbekistan compliance policy primitives",()=>{
  it("uses a configured minimum age instead of a hard-coded legal threshold",()=>{
    expect(isGuestFeeEligible(15,16)).toBe(false);
    expect(isGuestFeeEligible(16,16)).toBe(true);
    expect(isGuestFeeEligible(18,18)).toBe(true);
  });
  it("uses an explicit residency fact instead of inferring legal residency from nationality",()=>{
    expect(residencyScope(true)).toBe("resident");
    expect(residencyScope(false)).toBe("nonresident");
  });
  it("uses UZ as a stricter product storage default, not a legal assertion",()=>{
    expect(defaultProductDocumentStorageRegion("UZ")).toBe("UZ");
  });
  it("derives registration deadline only from configured policy hours",()=>{
    expect(registrationDueAt("2027-01-01T14:00:00+05:00",24)).toBe("2027-01-02T09:00:00.000Z");
  });
});
