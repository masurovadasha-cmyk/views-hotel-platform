import {describe,expect,it} from "vitest";
import {scopedIdempotencyKey} from "./_idempotency";

describe("scopedIdempotencyKey",()=>{
  it("namespaces equal client keys by organization",()=>{
    expect(scopedIdempotencyKey("views-a","same-key-123")).toBe("views-a:same-key-123");
    expect(scopedIdempotencyKey("views-b","same-key-123")).toBe("views-b:same-key-123");
  });

  it("rejects absent, short and oversized keys",()=>{
    expect(scopedIdempotencyKey("views",null)).toBeNull();
    expect(scopedIdempotencyKey("views","short")).toBeNull();
    expect(scopedIdempotencyKey("views","x".repeat(201))).toBeNull();
  });

  it("trims the client key before scoping",()=>{
    expect(scopedIdempotencyKey("views","  request-123  ")).toBe("views:request-123");
  });
});
