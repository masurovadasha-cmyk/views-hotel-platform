import {Module} from "@nestjs/common";
import {AnalyticsController} from "./analytics.controller";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsQueryService} from "./analytics-query.service";
import {AnalyticsWorkerService} from "./analytics-worker.service";

@Module({
  controllers:[AnalyticsController],
  providers:[AnalyticsProjectionService,AnalyticsQueryService,AnalyticsWorkerService],
  exports:[AnalyticsProjectionService,AnalyticsQueryService,AnalyticsWorkerService]
})
export class AnalyticsModule{}
