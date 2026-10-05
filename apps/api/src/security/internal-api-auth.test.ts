import {describe,expect,it} from "vitest";
import {assertInternalApiKey} from "./internal-api-auth";

const CURRENT="fixture-current-internal-api-key-material";
const PREVIOUS="fixture-previous-internal-api-key-material";

describe("internal API authentication",()=>{
  it("accepts the current configured key",()=>{
    expect(()=>assertInternalApiKey(CURRENT,[CURRENT,PREVIOUS])).not.toThrow();
  });

  it("accepts the previous key during a rotation window",()=>{
    expect(()=>assertInternalApiKey(PREVIOUS,[CURRENT,PREVIOUS])).not.toThrow();
  });

  it("keeps the single-key contract compatible",()=>{
    expect(()=>assertInternalApiKey(CURRENT,CURRENT)).not.toThrow();
  });

  it("rejects missing and mismatched keys",()=>{
    expect(()=>assertInternalApiKey(undefined,[CURRENT,PREVIOUS]))
      .toThrow("INTERNAL_API_UNAUTHORIZED");

    expect(()=>assertInternalApiKey(
      "different-internal-key-material-32chars",
      [CURRENT,PREVIOUS]
    )).toThrow("INTERNAL_API_UNAUTHORIZED");
  });

  it("rejects an empty accepted-key ring",()=>{
    expect(()=>assertInternalApiKey(CURRENT,[]))
      .toThrow("INTERNAL_API_UNAUTHORIZED");
  });
});
