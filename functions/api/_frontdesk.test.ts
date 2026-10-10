import {describe,expect,it} from "vitest";
import {canOperateFrontDesk,checkInUnitAllowed,nextReservationStatus} from "./_frontdesk";

describe("front desk lifecycle",()=>{
  it("allows check-in only from confirmed or assigned",()=>{
    expect(nextReservationStatus("confirmed","check_in")).toBe("checked_in");
    expect(nextReservationStatus("assigned","check_in")).toBe("checked_in");
    expect(nextReservationStatus("cancelled","check_in")).toBeNull();
    expect(nextReservationStatus("completed","check_in")).toBeNull();
  });

  it("allows check-out only from checked-in",()=>{
    expect(nextReservationStatus("checked_in","check_out")).toBe("completed");
    expect(nextReservationStatus("confirmed","check_out")).toBeNull();
  });

  it("keeps front desk lifecycle role-scoped",()=>{
    expect(canOperateFrontDesk("front_desk")).toBe(true);
    expect(canOperateFrontDesk("reservation_manager")).toBe(true);
    expect(canOperateFrontDesk("cleaner")).toBe(false);
  });

  it("blocks check-in to dirty or occupied units",()=>{
    expect(checkInUnitAllowed("available")).toBe(true);
    expect(checkInUnitAllowed("ready")).toBe(true);
    expect(checkInUnitAllowed("dirty")).toBe(false);
    expect(checkInUnitAllowed("occupied")).toBe(false);
  });
});
