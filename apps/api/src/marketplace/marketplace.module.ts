import {Module} from "@nestjs/common";
import {DatabaseModule} from "../database/database.module";
import {MarketStaffReadController} from "./market-staff-read.controller";
import {MarketStaffReadService} from "./market-staff-read.service";
import {PaymentsModule} from "../payments/payments.module";
import {MarketplaceEconomicsController} from "./marketplace-economics.controller";
import {MarketplaceEconomicsService} from "./marketplace-economics.service";

@Module({
  imports:[PaymentsModule,DatabaseModule],
  controllers:[MarketplaceEconomicsController,MarketStaffReadController],
  providers:[MarketplaceEconomicsService,MarketStaffReadService],
  exports:[MarketplaceEconomicsService]
})
export class MarketplaceModule{}
