import {PaymeExpiryWorkerService} from "./payme-expiry-worker.service";
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
import {RefundReconciliationService} from './refund-reconciliation.service';
import {RefundReconciliationController} from './refund-reconciliation.controller';

@Module({
  controllers:[
    PaymentController,PaymentWebhookController,PaymeMerchantApiController,RefundReconciliationController
  ],
  providers:[
    PaymentProviderRegistry,LedgerService,PaymentRecoveryService,PaymentIntentService,
    PaymentWebhookService,PaymentRefundWorkerService,RefundReconciliationService,
    PaymeSandboxPaymentProvider,PaymeMerchantApiService,PaymeExpiryWorkerService
  ],
  exports:[
    PaymentProviderRegistry,LedgerService,PaymentRecoveryService,PaymentIntentService,
    PaymentWebhookService,PaymentRefundWorkerService,
    PaymeMerchantApiService,PaymeExpiryWorkerService
  ]
})
export class PaymentsModule{}
