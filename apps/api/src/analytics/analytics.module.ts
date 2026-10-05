import {Module} from "@nestjs/common";
import {AnalyticsController} from "./analytics.controller";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsQueryService} from "./analytics-query.service";

@Module({
  controllers:[AnalyticsController],
  providers:[AnalyticsProjectionService,AnalyticsQueryService],
  exports:[AnalyticsProjectionService,AnalyticsQueryService]
})
export class AnalyticsModule{}
