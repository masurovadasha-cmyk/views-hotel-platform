import {Module} from "@nestjs/common";
import {PaymentsModule} from "../payments/payments.module";
import {MarketplaceEconomicsController} from "./marketplace-economics.controller";
import {MarketplaceEconomicsService} from "./marketplace-economics.service";

@Module({
  imports:[PaymentsModule],
  controllers:[MarketplaceEconomicsController],
  providers:[MarketplaceEconomicsService],
  exports:[MarketplaceEconomicsService]
})
export class MarketplaceModule{}
