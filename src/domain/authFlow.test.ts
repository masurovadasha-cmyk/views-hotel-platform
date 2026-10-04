import {describe,expect,it} from "vitest";
import {nextAuthState} from "./authFlow";
describe("auth flow",()=>{
  it("runs request to authenticated",()=>{
    let s="anonymous" as const;
    let a=nextAuthState(s,"request");
    expect(a).toBe("requesting");
    let b=nextAuthState(a,"sent");
    expect(b).toBe("link_sent");
    let c=nextAuthState(b,"verify");
    expect(c).toBe("verifying");
    expect(nextAuthState(c,"success")).toBe("authenticated");
  });
  it("logs out to anonymous",()=>expect(nextAuthState("authenticated","logout")).toBe("anonymous"));
});
