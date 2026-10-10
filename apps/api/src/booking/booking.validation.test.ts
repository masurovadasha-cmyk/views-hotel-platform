import {describe,expect,it} from "vitest";
import {validateHoldInput} from "./booking.validation";

const actor={organizationId:"o",userId:"u",membershipId:"m",requestId:"r"};

describe("booking hold validation",()=>{
  it("accepts a normal TTL",()=>{
    expect(validateHoldInput({actor,quoteId:"q",idempotencyKey:"k",ttlSeconds:900}).ttl).toBe(900);
  });
  it("caps hold ttl",()=>expect(()=>validateHoldInput({
    actor,quoteId:"q",idempotencyKey:"k",ttlSeconds:7200
  })).toThrow("INVALID_HOLD_TTL"));
  it("requires an idempotency key",()=>expect(()=>validateHoldInput({
    actor,quoteId:"q",idempotencyKey:""
  })).toThrow("INVALID_IDEMPOTENCY_KEY"));
});
