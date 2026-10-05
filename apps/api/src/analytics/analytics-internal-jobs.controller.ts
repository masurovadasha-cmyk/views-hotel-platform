import {
  BadRequestException,Body,Controller,Headers,Post,UnauthorizedException
} from "@nestjs/common";
import {loadConfig} from "../config";
import {trustedInternalServiceIdentity} from "../security/internal-service-identity";
import {AnalyticsReportSchedulerWorkerService} from "./analytics-report-scheduler-worker.service";
import {AnalyticsReportService} from "./analytics-report.service";
import {AnalyticsReportWorkerService} from "./analytics-report-worker.service";

@Controller("v1/internal/analytics")
export class AnalyticsInternalJobsController{
  constructor(
    private readonly scheduler:AnalyticsReportSchedulerWorkerService,
    private readonly reports:AnalyticsReportWorkerService,
    private readonly reportService:AnalyticsReportService
  ){}

  @Post("report-cycle")
  async reportCycle(
    @Headers("x-views-internal-key") internalApiKey:string|undefined,
    @Headers("x-views-service-id") serviceId:string|undefined,
    @Body() body:{scheduleLimit?:number;reportLimit?:number;pruneLimit?:number}
  ){
    try{
      const config=loadConfig();
      const identity=trustedInternalServiceIdentity(
        {
          "x-views-internal-key":internalApiKey,
          "x-views-service-id":serviceId
        },
        {
          legacyKeys:config.internalApiKeys,
          serviceKeys:config.internalServiceKeys
        }
      );
      if(!identity)throw new Error("INTERNAL_API_UNAUTHORIZED");
      const scheduleLimit=body.scheduleLimit??20;
      const reportLimit=body.reportLimit??20;
      const pruneLimit=body.pruneLimit??1000;

      if(!Number.isInteger(scheduleLimit)||scheduleLimit<1||scheduleLimit>100){
        throw new BadRequestException("INVALID_REPORT_SCHEDULE_LIMIT");
      }
      if(!Number.isInteger(reportLimit)||reportLimit<1||reportLimit>100){
        throw new BadRequestException("INVALID_REPORT_JOB_LIMIT");
      }
      if(!Number.isInteger(pruneLimit)||pruneLimit<1||pruneLimit>10000){
        throw new BadRequestException("INVALID_REPORT_PRUNE_LIMIT");
      }

      const schedules=await this.scheduler.runCycle(scheduleLimit);
      const reports=await this.reports.runCycle(reportLimit);
      const retention=await this.reportService.pruneExpiredArtifacts(pruneLimit);

      return {schedules,reports,retention};
    }catch(error){
      if(error instanceof BadRequestException||error instanceof UnauthorizedException){
        throw error;
      }
      if(
        error instanceof Error&&[
          "INTERNAL_API_UNAUTHORIZED",
          "INTERNAL_SERVICE_ID_REQUIRED",
          "INTERNAL_SERVICE_NOT_CONFIGURED"
        ].includes(error.message)
      ){
        throw new UnauthorizedException("internal API authentication required");
      }
      throw error;
    }
  }
}
