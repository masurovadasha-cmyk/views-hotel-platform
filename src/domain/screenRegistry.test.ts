import {describe,expect,it} from "vitest";
import {adminScreens,canvaParity,guestScreens,hostScreens,staffMobileScreens,staffWebScreens} from "./screenRegistry";

describe("Canva screen parity",()=>{
 it("tracks the complete 20-screen guest journey",()=>expect(guestScreens).toHaveLength(20));
 it("tracks host/staff/admin groups",()=>{
   expect(hostScreens).toHaveLength(5);
   expect(staffWebScreens).toHaveLength(7);
   expect(staffMobileScreens).toHaveLength(5);
   expect(adminScreens).toHaveLength(4);
 });
 it("exposes parity counters",()=>expect(canvaParity).toEqual({guest:20,host:5,staffWeb:7,staffMobile:5,admin:4}));
});
