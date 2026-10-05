import {Module} from "@nestjs/common";
import {PaymentsModule} from "../payments/payments.module";
import {MarketplaceEconomicsController} from "./marketplace-economics.controller";
import {MarketplaceEconomicsService} from "./marketplace-economics.service";
import {OwnerPayoutController} from "./owner-payout.controller";
import {OwnerPayoutProviderRegistry} from "./owner-payout-provider.registry";
import {OwnerPayoutService} from "./owner-payout.service";

@Module({
  imports:[PaymentsModule],
  controllers:[MarketplaceEconomicsController,OwnerPayoutController],
  providers:[MarketplaceEconomicsService,OwnerPayoutProviderRegistry,OwnerPayoutService],
  exports:[MarketplaceEconomicsService,OwnerPayoutProviderRegistry,OwnerPayoutService]
})
export class MarketplaceModule{}
