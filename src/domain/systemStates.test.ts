import {describe,expect,it} from "vitest";
import {canMutate,stateMessage} from "./systemStates";
describe("system states",()=>{
 it("blocks mutations while offline/read-only",()=>{expect(canMutate("offline")).toBe(false);expect(canMutate("read_only")).toBe(false)});
 it("allows mutations only when ready",()=>expect(canMutate("ready")).toBe(true));
 it("keeps explicit feedback",()=>expect(stateMessage("empty")).toBe("No items found"));
});
