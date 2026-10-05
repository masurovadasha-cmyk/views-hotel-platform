import {
  BadRequestException,Body,Controller,Headers,Post,UnauthorizedException
} from "@nestjs/common";
import {loadConfig} from "../config";
import {assertInternalApiKey} from "../security/internal-api-auth";
import {AnalyticsReportSchedulerWorkerService} from "./analytics-report-scheduler-worker.service";
import {AnalyticsReportWorkerService} from "./analytics-report-worker.service";

@Controller("v1/internal/analytics")
export class AnalyticsInternalJobsController{
  constructor(
    private readonly scheduler:AnalyticsReportSchedulerWorkerService,
    private readonly reports:AnalyticsReportWorkerService
  ){}

  @Post("report-cycle")
  async reportCycle(
    @Headers("x-views-internal-key") internalApiKey:string|undefined,
    @Body() body:{scheduleLimit?:number;reportLimit?:number}
  ){
    try{
      assertInternalApiKey(internalApiKey,loadConfig().internalApiKey);
      const scheduleLimit=body.scheduleLimit??20;
      const reportLimit=body.reportLimit??20;

      if(!Number.isInteger(scheduleLimit)||scheduleLimit<1||scheduleLimit>100){
        throw new BadRequestException("INVALID_REPORT_SCHEDULE_LIMIT");
      }
      if(!Number.isInteger(reportLimit)||reportLimit<1||reportLimit>100){
        throw new BadRequestException("INVALID_REPORT_JOB_LIMIT");
      }

      const schedules=await this.scheduler.runCycle(scheduleLimit);
      const reports=await this.reports.runCycle(reportLimit);

      return {schedules,reports};
    }catch(error){
      if(error instanceof BadRequestException||error instanceof UnauthorizedException){
        throw error;
      }
      if(error instanceof Error&&error.message==="INTERNAL_API_UNAUTHORIZED"){
        throw new UnauthorizedException("internal API authentication required");
      }
      throw error;
    }
  }
}
