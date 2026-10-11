import {describe,expect,it} from "vitest";
import {holdExpiryJobId} from "./hold-expiry.port";
describe("hold expiry queue contract",()=>{
  it("uses deterministic job ids for retry-safe scheduling",()=>{
    expect(holdExpiryJobId("abc")).toBe("booking-hold-expire:abc");
  });
});
