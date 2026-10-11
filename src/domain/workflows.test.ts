import { describe, expect, it } from "vitest";
import { transitionHousekeeping, transitionMaintenance, transitionServiceOrder } from "./workflows";
describe("workflows",()=>{
  it("runs checkout turnover to ready",()=>{let s="dirty";s=transitionHousekeeping(s,"start");expect(s).toBe("cleaning");s=transitionHousekeeping(s,"complete");expect(s).toBe("inspection");s=transitionHousekeeping(s,"verify");expect(s).toBe("ready")});
  it("runs maintenance through inspection",()=>{let s="open";s=transitionMaintenance(s,"start");expect(s).toBe("in_progress");s=transitionMaintenance(s,"resolve");expect(s).toBe("inspection");s=transitionMaintenance(s,"verify");expect(s).toBe("closed")});
  it("runs service order lifecycle",()=>{let s="new";s=transitionServiceOrder(s,"accept");expect(s).toBe("accepted");s=transitionServiceOrder(s,"start");expect(s).toBe("in_progress");s=transitionServiceOrder(s,"complete");expect(s).toBe("done")});
});
