import { describe,expect,it } from "vitest";
import { detectRuntimeMode,runtimeLabel } from "./runtime";
describe("runtime mode",()=>{
  it("keeps GitHub Pages honest about static demo mode",()=>expect(detectRuntimeMode("https://x.github.io/views-hotel-platform/")).toBe("static-demo"));
  it("allows explicit live API verification",()=>expect(detectRuntimeMode("https://x.github.io/views-hotel-platform/?api=live")).toBe("live-api"));
  it("labels modes truthfully",()=>expect(runtimeLabel("static-demo")).toBe("Static staging demo"));
});
