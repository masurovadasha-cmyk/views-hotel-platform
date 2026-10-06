import {Module} from "@nestjs/common";
import {LedgerService} from "./ledger.service";
import {PaymentController} from "./payment.controller";
import {PaymentIntentService} from "./payment-intent.service";
import {PaymentProviderRegistry} from "./payment-provider.registry";
import {PaymentRecoveryService} from "./payment-recovery.service";
import {PaymentRefundWorkerService} from "./payment-refund-worker.service";
import {PaymentWebhookController} from "./payment-webhook.controller";
import {PaymentWebhookService} from "./payment-webhook.service";
import {PaymeSandboxPaymentProvider} from "./payme-sandbox-payment-provider";
import {PaymeMerchantApiController} from "./payme-merchant-api.controller";
import {PaymeMerchantApiService} from "./payme-merchant-api.service";

@Module({
  controllers:[
    PaymentController,PaymentWebhookController,PaymeMerchantApiController
  ],
  providers:[
    PaymentProviderRegistry,LedgerService,PaymentRecoveryService,PaymentIntentService,
    PaymentWebhookService,PaymentRefundWorkerService,
    PaymeSandboxPaymentProvider,PaymeMerchantApiService
  ],
  exports:[
    PaymentProviderRegistry,LedgerService,PaymentRecoveryService,PaymentIntentService,
    PaymentWebhookService,PaymentRefundWorkerService,
    PaymeMerchantApiService
  ]
})
export class PaymentsModule{}
