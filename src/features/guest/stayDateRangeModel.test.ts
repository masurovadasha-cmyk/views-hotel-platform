import {describe,expect,it} from "vitest";
import {nextStaySelection,stayNights} from "./stayDateRangeModel";
describe("VIEWS unified stay calendar",()=>{
 it("calculates nights across month, year and leap day",()=>{
  expect(stayNights("2026-10-30","2026-11-02")).toBe(3);
  expect(stayNights("2026-12-31","2027-01-02")).toBe(2);
  expect(stayNights("2028-02-28","2028-03-01")).toBe(2);
 });
 it("rejects invalid and reversed ranges",()=>{
  expect(stayNights("2026-10-10","2026-10-10")).toBe(0);
  expect(stayNights("2026-10-11","2026-10-10")).toBe(0);
  expect(stayNights("","2026-10-11")).toBe(0);
 });
 it("selects start and end in the same calendar",()=>{
  expect(nextStaySelection("","","2026-10-12","2026-10-10")).toEqual(["2026-10-12",""]);
  expect(nextStaySelection("2026-10-12","","2026-10-15","2026-10-10")).toEqual(["2026-10-12","2026-10-15"]);
 });
 it("restarts range when choosing an earlier date or a new selection",()=>{
  expect(nextStaySelection("2026-10-12","","2026-10-11","2026-10-10")).toEqual(["2026-10-11",""]);
  expect(nextStaySelection("2026-10-12","2026-10-15","2026-10-20","2026-10-10")).toEqual(["2026-10-20",""]);
 });
 it("ignores dates before today",()=>{
  expect(nextStaySelection("","","2026-10-09","2026-10-10")).toEqual(["",""]);
 });
});
