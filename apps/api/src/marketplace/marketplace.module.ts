import {Module} from "@nestjs/common";
import {DatabaseModule} from "../database/database.module";
import {MarketStaffReadController} from "./market-staff-read.controller";
import {MarketStaffReadService} from "./market-staff-read.service";
import {MarketStaffCommandService} from "./market-staff-command.service";
import {MarketStaffCommandController} from "./market-staff-command.controller";
import {PaymentsModule} from "../payments/payments.module";
import {MarketplaceEconomicsController} from "./marketplace-economics.controller";
import {MarketplaceEconomicsService} from "./marketplace-economics.service";

@Module({
  imports:[PaymentsModule,DatabaseModule],
  controllers:[MarketplaceEconomicsController,MarketStaffReadController,MarketStaffCommandController],
  providers:[MarketplaceEconomicsService,MarketStaffReadService,MarketStaffCommandService],
  exports:[MarketplaceEconomicsService]
})
export class MarketplaceModule{}
