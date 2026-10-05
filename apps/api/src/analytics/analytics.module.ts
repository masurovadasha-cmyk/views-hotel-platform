import {Module} from "@nestjs/common";
import {MarketplaceAnalyticsController} from "./marketplace-analytics.controller";
import {AnalyticsDashboardController} from "./analytics-dashboard.controller";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";
import {AnalyticsReportController} from "./analytics-report.controller";
import {AnalyticsInternalJobsController} from "./analytics-internal-jobs.controller";
import {AnalyticsReportScheduleController} from "./analytics-report-schedule.controller";
import {AnalyticsReportScheduleService} from "./analytics-report-schedule.service";
import {AnalyticsReportSchedulerWorkerService} from "./analytics-report-scheduler-worker.service";
import {AnalyticsReportService} from "./analytics-report.service";
import {AnalyticsReportWorkerService} from "./analytics-report-worker.service";
import {MarketplaceAnalyticsQueryService} from "./marketplace-analytics-query.service";
import {AnalyticsController} from "./analytics.controller";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsQueryService} from "./analytics-query.service";
import {AnalyticsRollupService} from "./analytics-rollup.service";
import {AnalyticsWorkerService} from "./analytics-worker.service";

@Module({
  controllers:[AnalyticsController,MarketplaceAnalyticsController,AnalyticsDashboardController,AnalyticsReportController,AnalyticsReportScheduleController,AnalyticsInternalJobsController],
  providers:[AnalyticsProjectionService,AnalyticsQueryService,MarketplaceAnalyticsQueryService,AnalyticsDashboardService,AnalyticsReportService,AnalyticsReportWorkerService,AnalyticsReportScheduleService,AnalyticsReportSchedulerWorkerService,AnalyticsRollupService,AnalyticsWorkerService],
  exports:[AnalyticsProjectionService,AnalyticsQueryService,MarketplaceAnalyticsQueryService,AnalyticsDashboardService,AnalyticsReportService,AnalyticsReportWorkerService,AnalyticsReportScheduleService,AnalyticsReportSchedulerWorkerService,AnalyticsRollupService,AnalyticsWorkerService]
})
export class AnalyticsModule{}
