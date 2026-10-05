import {describe,expect,it} from "vitest";
import {dashboardSummaryCsv} from "./analytics-report-csv";

describe("analytics report CSV",()=>{
  it("emits stable metric rows",()=>{
    const csv=dashboardSummaryCsv({
      kpisByCurrency:[{
        currency:"UZS",
        bookingCount:3,
        accommodationRevenueMinor:"12000",
        occupancy:0.5
      }]
    });

    expect(csv.startsWith("section,currency,dimension,metric,value\r\n")).toBe(true);
    expect(csv).toContain("hospitality,UZS,,accommodationRevenueMinor,12000");
    expect(csv).toContain("hospitality,UZS,,bookingCount,3");
  });

  it("escapes geography dimensions containing commas or quotes",()=>{
    const csv=dashboardSummaryCsv({
      geography:[{
        currency:"USD",
        countryCode:"UZ",
        regionCode:null,
        city:'Tashkent, "Center"',
        propertyCount:2
      }]
    });

    expect(csv).toContain('geography,USD,"country=UZ;city=Tashkent, ""Center"""');
    expect(csv).toContain(",propertyCount,2");
  });
});
