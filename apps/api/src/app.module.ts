import {Module} from "@nestjs/common";
import {APP_GUARD} from "@nestjs/core";
import {MarketplaceModule} from "./marketplace/marketplace.module";
import {AnalyticsModule} from "./analytics/analytics.module";
import {BookingModule} from "./booking/booking.module";
import {DatabaseModule} from "./database/database.module";
import {HealthController} from "./health.controller";
import {InventoryModule} from "./inventory/inventory.module";
import {RatesModule} from "./rates/rates.module";
import {PaymentsModule} from "./payments/payments.module";
import {ComplianceModule} from "./compliance/compliance.module";
import {InternalActorAuthGuard} from "./security/internal-actor-auth.guard";

@Module({
  imports:[
    DatabaseModule,InventoryModule,RatesModule,BookingModule,
    PaymentsModule,ComplianceModule,AnalyticsModule,MarketplaceModule
  ],
  controllers:[HealthController],
  providers:[
    {provide:APP_GUARD,useClass:InternalActorAuthGuard}
  ]
})
export class AppModule{}
