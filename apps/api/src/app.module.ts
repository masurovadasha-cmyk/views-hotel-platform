import {Module} from "@nestjs/common";
import {APP_GUARD,APP_INTERCEPTOR} from "@nestjs/core";
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
import {InternalAuthRejectionController} from "./security/internal-auth-rejection.controller";
import {InternalAuthRejectionService} from "./security/internal-auth-rejection.service";
import {InternalServiceAuditController} from "./security/internal-service-audit.controller";
import {InternalServiceAuditInterceptor} from "./security/internal-service-audit.interceptor";
import {InternalServiceAuditService} from "./security/internal-service-audit.service";
import {InternalServicePostureController} from "./security/internal-service-posture.controller";
import {InternalServicePostureService} from "./security/internal-service-posture.service";

@Module({
  imports:[
    DatabaseModule,InventoryModule,RatesModule,BookingModule,
    PaymentsModule,ComplianceModule,AnalyticsModule,MarketplaceModule
  ],
  controllers:[
    HealthController,
    InternalServiceAuditController,
    InternalAuthRejectionController,
    InternalServicePostureController
  ],
  providers:[
    InternalServiceAuditService,
    InternalAuthRejectionService,
    InternalServicePostureService,
    {provide:APP_GUARD,useClass:InternalActorAuthGuard},
    {provide:APP_INTERCEPTOR,useClass:InternalServiceAuditInterceptor}
  ]
})
export class AppModule{}
