import {Module} from "@nestjs/common";
import {MarketplaceAnalyticsController} from "./marketplace-analytics.controller";
import {MarketplaceAnalyticsQueryService} from "./marketplace-analytics-query.service";
import {AnalyticsController} from "./analytics.controller";
import {AnalyticsDashboardController} from "./analytics-dashboard.controller";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsQueryService} from "./analytics-query.service";
import {AnalyticsRollupService} from "./analytics-rollup.service";
import {AnalyticsWorkerService} from "./analytics-worker.service";

@Module({
  controllers:[AnalyticsController,MarketplaceAnalyticsController,AnalyticsDashboardController],
  providers:[AnalyticsProjectionService,AnalyticsQueryService,MarketplaceAnalyticsQueryService,AnalyticsDashboardService,AnalyticsRollupService,AnalyticsWorkerService],
  exports:[AnalyticsProjectionService,AnalyticsQueryService,MarketplaceAnalyticsQueryService,AnalyticsDashboardService,AnalyticsRollupService,AnalyticsWorkerService]
})
export class AnalyticsModule{}
