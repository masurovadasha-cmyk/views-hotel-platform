import {Module} from "@nestjs/common";
import {MarketplaceAnalyticsController} from "./marketplace-analytics.controller";
import {MarketplaceAnalyticsQueryService} from "./marketplace-analytics-query.service";
import {AnalyticsController} from "./analytics.controller";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsQueryService} from "./analytics-query.service";
import {AnalyticsRollupService} from "./analytics-rollup.service";
import {AnalyticsWorkerService} from "./analytics-worker.service";

@Module({
  controllers:[AnalyticsController,MarketplaceAnalyticsController],
  providers:[AnalyticsProjectionService,AnalyticsQueryService,MarketplaceAnalyticsQueryService,AnalyticsRollupService,AnalyticsWorkerService],
  exports:[AnalyticsProjectionService,AnalyticsQueryService,MarketplaceAnalyticsQueryService,AnalyticsRollupService,AnalyticsWorkerService]
})
export class AnalyticsModule{}
