import {describe,it,expect} from "vitest";
import {nightsBetween} from "./RangeCalendar";
describe("shared Canva-style date range",()=>{
 it("counts nights across months and leap days",()=>{
  expect(nightsBetween("2028-02-28","2028-03-01")).toBe(2);
  expect(nightsBetween("2026-10-11","2026-10-15")).toBe(4);
 });
 it("rejects empty or reversed ranges",()=>{
  expect(nightsBetween("","2026-10-15")).toBe(0);
  expect(nightsBetween("2026-10-15","2026-10-11")).toBe(0);
 });
});
