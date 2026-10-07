import {describe,expect,it} from "vitest";
import {detectRuntimeMode,runtimeLabel} from "./runtime";
describe("runtime mode",()=>{
  it("keeps explicit local review separate from live API",()=>expect(detectRuntimeMode("http://127.0.0.1:4173/?api=demo")).toBe("static-demo"));
  it("keeps GitHub Pages honest about static demo mode",()=>expect(detectRuntimeMode("https://x.github.io/views-hotel-platform/")).toBe("static-demo"));
  it("allows explicit live API verification",()=>expect(detectRuntimeMode("https://x.github.io/views-hotel-platform/?api=live")).toBe("live-api"));
  it("opens the connected workspace by default only on the dedicated local server",()=>{
    for(const host of ['localhost','127.0.0.1'])expect(detectRuntimeMode('http://'+host+':4173/')).toBe('local-core');
    expect(detectRuntimeMode('https://hotel.example/')).toBe('live-api');
    expect(detectRuntimeMode('http://localhost:3000/')).toBe('live-api');
    expect(detectRuntimeMode('http://localhost:4173/?api=live')).toBe('live-api');
    expect(detectRuntimeMode('http://localhost:4173/?api=demo')).toBe('static-demo');
  });
  it("labels demo truthfully",()=>expect(runtimeLabel("static-demo")).toBe("Static staging demo"));
  it("opens local Core only on the dedicated loopback HTTP origin",()=>{
    for(const host of ["127.0.0.1","localhost"])expect(detectRuntimeMode("http://"+host+":4173/?api=local-core")).toBe("local-core");
  });
  it("does not enable a local workspace on public or arbitrary origins",()=>{
    for(const url of ["https://x.github.io/?api=local-core","http://localhost:3000/?api=local-core","https://localhost:4173/?api=local-core","http://127.0.0.1.evil.example:4173/?api=local-core"])
      expect(detectRuntimeMode(url)).not.toBe("local-core");
  });
  it("distinguishes local Core from a production login",()=>expect(runtimeLabel("local-core")).toBe("Локальный Core · тест"));
});
