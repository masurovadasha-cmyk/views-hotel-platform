import type {RequestActorContext} from "../identity/actor-context";
import type {SupportedPaymentProvider} from "./payment-provider.port";

export type PaymentStatus=
  |"requires_payment"|"pending_provider"|"authorized"|"partially_captured"|"captured"
  |"refund_pending"|"partially_refunded"|"refunded"|"failed"|"cancelled";

export type CreatePaymentIntentInput={
  actor:RequestActorContext;
  reservationId:string;
  provider:SupportedPaymentProvider;
  idempotencyKey:string;
  returnUrl:string;
};

export type PaymentIntentResult={
  paymentIntentId:string;
  reservationId:string;
  provider:SupportedPaymentProvider;
  status:PaymentStatus;
  amountMinor:bigint;
  currency:string;
  checkoutUrl:string|null;
  idempotentReplay:boolean;
};
