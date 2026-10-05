import {Module} from "@nestjs/common";
import {MarketplaceEconomicsController} from "./marketplace-economics.controller";
import {MarketplaceEconomicsService} from "./marketplace-economics.service";

@Module({
  controllers:[MarketplaceEconomicsController],
  providers:[MarketplaceEconomicsService],
  exports:[MarketplaceEconomicsService]
})
export class MarketplaceModule{}