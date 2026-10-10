import {describe,expect,it} from "vitest";
import {pickAssignee} from "./workload";
describe("workload routing",()=>{
 const staff=[
  {userId:"a",role:"cleaner",active:5,completedToday:2,available:true,skills:["studio"]},
  {userId:"b",role:"cleaner",active:2,completedToday:4,available:true,skills:["studio"]},
  {userId:"c",role:"cleaner",active:0,completedToday:0,available:false,skills:["studio"]}
 ];
 it("selects the available lower-load matching role",()=>expect(pickAssignee(staff,"cleaner","studio")?.userId).toBe("b"));
 it("returns null when no skill match exists",()=>expect(pickAssignee(staff,"cleaner","villa")).toBeNull());
});
