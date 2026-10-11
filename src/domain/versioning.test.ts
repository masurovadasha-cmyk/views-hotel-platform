import { describe,expect,it } from "vitest";
import { optimisticUpdate } from "./versioning";
describe("optimistic versioning",()=>{
  it("increments a matching version",()=>expect(optimisticUpdate({id:"x",version:2},2,{id:"y"})).toEqual({id:"y",version:3}));
  it("rejects stale writes",()=>expect(()=>optimisticUpdate({id:"x",version:3},2,{id:"y"})).toThrow("VERSION_CONFLICT"));
});
