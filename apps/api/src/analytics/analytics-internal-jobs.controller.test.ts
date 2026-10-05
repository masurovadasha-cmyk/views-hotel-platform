import {describe,expect,it,vi} from "vitest";
import {UnauthorizedException} from "@nestjs/common";
import {AnalyticsInternalJobsController} from "./analytics-internal-jobs.controller";

describe("analytics internal report cycle",()=>{
  it("rejects a missing internal key",async()=>{
    const controller=new AnalyticsInternalJobsController(
      {runCycle:vi.fn()} as any,
      {runCycle:vi.fn()} as any,
      {pruneExpiredArtifacts:vi.fn()} as any
    );

    await expect(controller.reportCycle(undefined,undefined,"analytics-cron",undefined,{}))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("runs schedule enqueue before report rendering with a valid key",async()=>{
    const order:string[]=[];
    const scheduler={
      runCycle:vi.fn(async(limit:number)=>{
        order.push("scheduler");
        return {claimed:1,enqueued:1,limit};
      })
    };
    const reports={
      runCycle:vi.fn(async(limit:number)=>{
        order.push("reports");
        return {claimed:1,completed:1,limit};
      })
    };
    const retention={
      pruneExpiredArtifacts:vi.fn(async(limit:number)=>{
        order.push("retention");
        return {pruned:0,limit};
      })
    };
    const controller=new AnalyticsInternalJobsController(
      scheduler as any,
      reports as any,
      retention as any
    );

    const result=await controller.reportCycle(
      "views-development-only-internal-api-key-not-for-production",
      undefined,
      "analytics-cron",
      undefined,
      {scheduleLimit:3,reportLimit:4,pruneLimit:5}
    );

    expect(order).toEqual(["scheduler","reports","retention"]);
    expect(scheduler.runCycle).toHaveBeenCalledWith(3);
    expect(reports.runCycle).toHaveBeenCalledWith(4);
    expect(retention.pruneExpiredArtifacts).toHaveBeenCalledWith(5);
    expect(result.schedules.enqueued).toBe(1);
    expect(result.reports.completed).toBe(1);
    expect(result.retention.pruned).toBe(0);
  });
});
