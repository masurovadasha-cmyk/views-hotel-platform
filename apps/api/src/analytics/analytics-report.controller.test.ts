import {describe,expect,it,vi} from "vitest";
import {AnalyticsReportController} from "./analytics-report.controller";

const ORG="00000000-0000-4000-8000-000000000001";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBERSHIP="30000000-0000-4000-8000-000000000001";
const JOB="90000000-0000-4000-8000-000000000001";
const CHECKSUM="a".repeat(64);
const ETAG='"views-report-v1-'+CHECKSUM+'"';

function response(){
  const headers=new Map<string,string>();
  const value={
    statusCode:200,
    setHeader:vi.fn((name:string,v:string)=>{headers.set(name.toLowerCase(),String(v))}),
    status:vi.fn((code:number)=>{value.statusCode=code;return value}),
    headers
  };
  return value;
}

function service(){
  return {
    artifact:vi.fn(async()=>({
      format:"json",
      contentType:"application/json",
      filename:"views-report.json",
      byteSize:2,
      checksumSha256:CHECKSUM,
      content:Buffer.from("{}"),
      createdAt:"2036-01-01T00:00:00.000Z",
      expiresAt:"2036-01-31T00:00:00.000Z"
    })),
    recordDownload:vi.fn(async()=>({recorded:true}))
  };
}

describe("analytics report download audit boundary",()=>{
  it("does not audit a conditional 304 response",async()=>{
    const reports=service();
    const controller=new AnalyticsReportController(reports as any);
    const res=response();

    const result=await controller.download(
      JOB,ETAG,ORG,USER,MEMBERSHIP,"request-304",res as any
    );

    expect(result).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(304);
    expect(reports.recordDownload).not.toHaveBeenCalled();
  });

  it("audits a successful 200 download before streaming bytes",async()=>{
    const reports=service();
    const controller=new AnalyticsReportController(reports as any);
    const res=response();

    const result=await controller.download(
      JOB,undefined,ORG,USER,MEMBERSHIP,"request-200",res as any
    );

    expect(result).toBeTruthy();
    expect(reports.recordDownload).toHaveBeenCalledTimes(1);
    expect(reports.recordDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId:ORG,userId:USER,membershipId:MEMBERSHIP,requestId:"request-200"
      }),
      JOB,
      expect.objectContaining({checksumSha256:CHECKSUM,byteSize:2,format:"json"})
    );
    expect(res.headers.get("x-content-sha256")).toBe(CHECKSUM);
    expect(res.headers.get("x-artifact-expires-at"))
      .toBe("2036-01-31T00:00:00.000Z");
  });
});
