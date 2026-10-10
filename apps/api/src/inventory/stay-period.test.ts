import {describe,expect,it} from "vitest";
import {validateStayPeriod} from "./stay-period";
describe("stay period",()=>{
 it("accepts a positive half-open stay",()=>expect(validateStayPeriod({checkInAt:"2026-10-10T14:00:00+05:00",checkOutAt:"2026-10-12T12:00:00+05:00"}).durationMs).toBeGreaterThan(0));
 it("rejects zero length",()=>expect(()=>validateStayPeriod({checkInAt:"2026-10-10T14:00:00+05:00",checkOutAt:"2026-10-10T14:00:00+05:00"})).toThrow("INVALID_STAY_PERIOD"));
 it("rejects backwards period",()=>expect(()=>validateStayPeriod({checkInAt:"2026-10-12T14:00:00+05:00",checkOutAt:"2026-10-10T14:00:00+05:00"})).toThrow("INVALID_STAY_PERIOD"));
});
