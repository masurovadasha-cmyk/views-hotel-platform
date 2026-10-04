import {Module} from "@nestjs/common";
import {LedgerService} from "./ledger.service";
import {PaymentController} from "./payment.controller";
import {PaymentIntentService} from "./payment-intent.service";
import {PaymentProviderRegistry} from "./payment-provider.registry";
import {PaymentRefundWorkerService} from "./payment-refund-worker.service";
import {PaymentWebhookController} from "./payment-webhook.controller";
import {PaymentWebhookService} from "./payment-webhook.service";

@Module({
  controllers:[PaymentController,PaymentWebhookController],
  providers:[
    PaymentProviderRegistry,LedgerService,PaymentIntentService,
    PaymentWebhookService,PaymentRefundWorkerService
  ],
  exports:[
    PaymentProviderRegistry,LedgerService,PaymentIntentService,
    PaymentWebhookService,PaymentRefundWorkerService
  ]
})
export class PaymentsModule{}
