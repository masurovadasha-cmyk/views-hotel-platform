import {describe,expect,it} from "vitest";
import {assertInternalApiKey} from "./internal-api-auth";

describe("internal API authentication",()=>{
  it("accepts the configured key",()=>{
    expect(()=>assertInternalApiKey(
      "fixture-internal-api-key-material-32chars",
      "fixture-internal-api-key-material-32chars"
    )).not.toThrow();
  });

  it("rejects missing and mismatched keys",()=>{
    expect(()=>assertInternalApiKey(
      undefined,
      "fixture-internal-api-key-material-32chars"
    )).toThrow("INTERNAL_API_UNAUTHORIZED");

    expect(()=>assertInternalApiKey(
      "different-internal-key-material-32chars",
      "fixture-internal-api-key-material-32chars"
    )).toThrow("INTERNAL_API_UNAUTHORIZED");
  });
});
