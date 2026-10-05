import {Module} from "@nestjs/common";
import {AnalyticsController} from "./analytics.controller";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsQueryService} from "./analytics-query.service";
import {AnalyticsRollupService} from "./analytics-rollup.service";
import {AnalyticsWorkerService} from "./analytics-worker.service";

@Module({
  controllers:[AnalyticsController],
  providers:[AnalyticsProjectionService,AnalyticsQueryService,AnalyticsRollupService,AnalyticsWorkerService],
  exports:[AnalyticsProjectionService,AnalyticsQueryService,AnalyticsRollupService,AnalyticsWorkerService]
})
export class AnalyticsModule{}
