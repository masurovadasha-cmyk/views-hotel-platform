import {describe,expect,it} from "vitest";
import {mayManageException,nextDamageStatus,nextLostFoundStatus} from "./exceptionWorkflows";

describe("operations exception workflows",()=>{
  it("scopes exception permissions by role",()=>{
    expect(mayManageException("concierge","lost_found")).toBe(true);
    expect(mayManageException("cleaner","damage")).toBe(false);
    expect(mayManageException("general_manager","inventory")).toBe(true);
  });
  it("moves lost property through custody lifecycle",()=>{
    expect(nextLostFoundStatus("pending","claim")).toBe("claimed");
    expect(nextLostFoundStatus("claimed","return")).toBe("returned");
    expect(nextLostFoundStatus("returned","close")).toBe("closed");
  });
  it("moves damage through review lifecycle",()=>{
    expect(nextDamageStatus("open","review")).toBe("review");
    expect(nextDamageStatus("review","resolve")).toBe("resolved");
    expect(nextDamageStatus("resolved","close")).toBe("closed");
  });
  it("rejects invalid transitions",()=>expect(()=>nextDamageStatus("closed","review")).toThrow("INVALID_TRANSITION"));
});
