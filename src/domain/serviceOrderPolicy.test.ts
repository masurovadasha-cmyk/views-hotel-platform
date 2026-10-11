import { describe,expect,it } from "vitest";
import { mayCreateStaffOrder,mayReadServiceOrder } from "./serviceOrderPolicy";
import { initialOrders } from "../data/demo";

describe("server policy contracts",()=>{
  it("does not give cleaner finance/admin-like creation rights",()=>{
    expect(mayCreateStaffOrder({mode:"staff",userId:"u-cleaner",role:"cleaner",organizationId:"org",propertyIds:["p"]},"cleaning")).toBe(false);
  });
  it("lets supervisor create only housekeeping work",()=>{
    const s={mode:"staff" as const,userId:"sup",role:"housekeeping_supervisor" as const,organizationId:"org",propertyIds:["p"]};
    expect(mayCreateStaffOrder(s,"cleaning")).toBe(true);
    expect(mayCreateStaffOrder(s,"maintenance")).toBe(false);
  });
  it("keeps technician reads assigned and maintenance-only",()=>{
    const s={mode:"staff" as const,userId:"u-tech",role:"technician" as const,organizationId:"org",propertyIds:["p"]};
    expect(initialOrders.filter(o=>mayReadServiceOrder(s,o)).map(o=>o.id)).toEqual(["SO-1003"]);
  });
});
