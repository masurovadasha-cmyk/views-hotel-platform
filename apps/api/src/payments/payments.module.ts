import {Module} from "@nestjs/common";
import {LedgerService} from "./ledger.service";
import {MarketplaceEconomicsController} from "./marketplace-economics.controller";
import {MarketplaceEconomicsService} from "./marketplace-economics.service";
import {PaymentController} from "./payment.controller";
import {PaymentIntentService} from "./payment-intent.service";
import {PaymentProviderRegistry} from "./payment-provider.registry";
import {PaymentRecoveryService} from "./payment-recovery.service";
import {PaymentRefundWorkerService} from "./payment-refund-worker.service";
import {PaymentWebhookController} from "./payment-webhook.controller";
import {PaymentWebhookService} from "./payment-webhook.service";

@Module({
  controllers:[PaymentController,PaymentWebhookController,MarketplaceEconomicsController],
  providers:[
    PaymentProviderRegistry,LedgerService,PaymentRecoveryService,PaymentIntentService,
    PaymentWebhookService,PaymentRefundWorkerService,MarketplaceEconomicsService
  ],
  exports:[
    PaymentProviderRegistry,LedgerService,PaymentRecoveryService,PaymentIntentService,
    PaymentWebhookService,PaymentRefundWorkerService,MarketplaceEconomicsService
  ]
})
export class PaymentsModule{}
