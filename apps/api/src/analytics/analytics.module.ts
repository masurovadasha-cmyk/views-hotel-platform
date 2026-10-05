import {Module} from "@nestjs/common";
import {MarketplaceAnalyticsController} from "./marketplace-analytics.controller";
import {AnalyticsExportController} from "./analytics-export.controller";
import {AnalyticsExportService} from "./analytics-export.service";
import {AnalyticsExportWorkerService} from "./analytics-export-worker.service";
import {AnalyticsExportStorageRegistry} from "./analytics-export-storage.registry";
import {AnalyticsDashboardController} from "./analytics-dashboard.controller";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";
import {MarketplaceAnalyticsQueryService} from "./marketplace-analytics-query.service";
import {AnalyticsController} from "./analytics.controller";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsQueryService} from "./analytics-query.service";
import {AnalyticsRollupService} from "./analytics-rollup.service";
import {AnalyticsWorkerService} from "./analytics-worker.service";

@Module({
  controllers:[AnalyticsController,MarketplaceAnalyticsController,AnalyticsDashboardController,AnalyticsExportController],
  providers:[AnalyticsProjectionService,AnalyticsQueryService,MarketplaceAnalyticsQueryService,AnalyticsDashboardService,AnalyticsExportStorageRegistry,AnalyticsExportService,AnalyticsExportWorkerService,AnalyticsRollupService,AnalyticsWorkerService],
  exports:[AnalyticsProjectionService,AnalyticsQueryService,MarketplaceAnalyticsQueryService,AnalyticsDashboardService,AnalyticsExportStorageRegistry,AnalyticsExportService,AnalyticsExportWorkerService,AnalyticsRollupService,AnalyticsWorkerService]
})
export class AnalyticsModule{}
