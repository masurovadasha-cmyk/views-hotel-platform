import {describe,expect,it} from "vitest";
import {canAccessProperty,canVerifyHousekeeping,canVerifyMaintenance,canWorkServiceCategory,isManagement,type StaffSession} from "./_authorization";

const manager:StaffSession={mode:"staff",userId:"u1",role:"general_manager",organizationId:"views",propertyIds:["utower"]};
const admin:StaffSession={mode:"staff",userId:"u2",role:"super_admin",organizationId:"views",propertyIds:[]};

describe("operational authorization",()=>{
  it("keeps general managers property scoped",()=>{
    expect(canAccessProperty(manager,"utower")).toBe(true);
    expect(canAccessProperty(manager,"nest-one")).toBe(false);
  });

  it("allows platform super admins to cross property scope",()=>{
    expect(canAccessProperty(admin,"nest-one")).toBe(true);
  });

  it("keeps service categories role scoped",()=>{
    expect(canWorkServiceCategory("cleaner","cleaning")).toBe(true);
    expect(canWorkServiceCategory("cleaner","maintenance")).toBe(false);
    expect(isManagement("general_manager")).toBe(true);
  });

  it("requires a supervisor for housekeeping inspection",()=>{
    expect(canVerifyHousekeeping("cleaner")).toBe(false);
    expect(canVerifyHousekeeping("housekeeping_supervisor")).toBe(true);
  });

  it("requires a manager for maintenance verification",()=>{
    expect(canVerifyMaintenance("technician")).toBe(false);
    expect(canVerifyMaintenance("maintenance_manager")).toBe(true);
  });
});
