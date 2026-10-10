import { describe, expect, it } from "vitest";
import { canSeeServiceOrder, roleNavigation } from "./rbac";
import { initialOrders } from "../data/demo";
describe("RBAC",()=>{
  it("keeps cleaner navigation minimal",()=>{expect(roleNavigation.cleaner).toEqual(["overview","my-tasks"]);expect(roleNavigation.cleaner).not.toContain("finance")});
  it("filters cleaner to assigned cleaning tasks",()=>{const visible=initialOrders.filter(o=>canSeeServiceOrder("cleaner","u-cleaner",o));expect(visible).toHaveLength(1);expect(visible[0].category).toBe("cleaning")});
  it("gives manager complete operations access",()=>{expect(roleNavigation.general_manager).toContain("admin");expect(initialOrders.every(o=>canSeeServiceOrder("general_manager","u-manager",o))).toBe(true)});
});
