import { describe,expect,it } from "vitest";
import { detectRuntimeMode,runtimeLabel } from "./runtime";
describe("runtime mode",()=>{
  it("keeps explicit local review separate from live API",()=>expect(detectRuntimeMode("http://127.0.0.1:4173/?api=demo")).toBe("static-demo"));
  it("keeps GitHub Pages honest about static demo mode",()=>expect(detectRuntimeMode("https://x.github.io/views-hotel-platform/")).toBe("static-demo"));
  it("allows explicit live API verification",()=>expect(detectRuntimeMode("https://x.github.io/views-hotel-platform/?api=live")).toBe("live-api"));
  it("labels modes truthfully",()=>expect(runtimeLabel("static-demo")).toBe("Static staging demo"));
});
