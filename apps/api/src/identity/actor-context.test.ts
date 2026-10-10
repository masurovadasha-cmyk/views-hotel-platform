import {describe,expect,it} from "vitest";
import {requireUuid} from "./actor-context";
describe("actor context",()=>{
 it("accepts UUID context",()=>expect(requireUuid("00000000-0000-4000-8000-000000000001","user_id")).toContain("00000000"));
 it("rejects arbitrary tenant identifiers",()=>expect(()=>requireUuid("platform-admin","user_id")).toThrow("INVALID_USER_ID"));
});
