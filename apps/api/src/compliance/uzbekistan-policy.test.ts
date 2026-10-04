import {describe,expect,it} from "vitest";
import {
  defaultGuestDocumentStorageRegion,isUzbekistanTouristFeeEligible,
  registrationDueAt,uzbekistanTouristFeeResidency
} from "./uzbekistan-policy";

describe("Uzbekistan compliance policy primitives",()=>{
  it("exempts guests younger than 16 from tourist fee eligibility",()=>{
    expect(isUzbekistanTouristFeeEligible(15)).toBe(false);
    expect(isUzbekistanTouristFeeEligible(16)).toBe(true);
  });
  it("maps UZ residency separately from nonresident guests",()=>{
    expect(uzbekistanTouristFeeResidency("UZ")).toBe("resident");
    expect(uzbekistanTouristFeeResidency("DE")).toBe("nonresident");
  });
  it("uses UZ as the stricter product default for identity documents",()=>{
    expect(defaultGuestDocumentStorageRegion("UZ")).toBe("UZ");
  });
  it("derives registration deadline only from configured policy hours",()=>{
    expect(registrationDueAt("2027-01-01T14:00:00+05:00",24)).toBe("2027-01-02T09:00:00.000Z");
  });
});
