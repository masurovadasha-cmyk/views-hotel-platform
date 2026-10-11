import {describe,expect,it} from "vitest";
import {renderDashboardReport} from "./analytics-report-renderer";

describe("analytics report renderer",()=>{
  it("renders deterministic JSON without volatile cache metadata",()=>{
    const a=renderDashboardReport({
      schemaVersion:2,
      period:{from:"2036-01-01",to:"2036-01-01"},
      freshness:{sourceFingerprint:"a".repeat(64)},
      value:123,
      cache:{hit:false,generatedAt:"one"}
    },"json");

    const b=renderDashboardReport({
      value:123,
      freshness:{sourceFingerprint:"a".repeat(64)},
      period:{to:"2036-01-01",from:"2036-01-01"},
      schemaVersion:2,
      cache:{hit:true,generatedAt:"two"}
    },"json");

    expect(a.checksumSha256).toBe(b.checksumSha256);
    const parsed=JSON.parse(a.content.toString("utf8"));
    expect(parsed.cache).toBeUndefined();
    expect(parsed.value).toBe(123);
  });

  it("renders flattened CSV and neutralizes spreadsheet formulas",()=>{
    const report=renderDashboardReport({
      safe:"hello",
      nested:{danger:"=1+1"},
      list:[{currency:"UZS",amount:"1000"}],
      cache:{hit:false}
    },"csv");
    const csv=report.content.toString("utf8");

    expect(report.contentType).toBe("text/csv; charset=utf-8");
    expect(csv).toContain("path,value");
    expect(csv).toContain("nested.danger,'=1+1");
    expect(csv).toContain("list[0].currency,UZS");
    expect(csv).not.toContain("cache.hit");
  });
});
