export type SupportedPaymentProvider="payme"|"click"|"uzum"|"octo"|"multicard"|"stripe";

export type HostedCheckoutRequest={
  organizationId:string;
  paymentIntentId:string;
  amountMinor:bigint;
  currency:string;
  returnUrl:string;
  metadata:Record<string,string>;
};

export type HostedCheckoutResult={
  providerAttemptRef:string;
  checkoutUrl:string;
  expiresAt:string|null;
};

export type VerifiedWebhookEvent={
  organizationId:string;
  externalEventId:string;
  externalTransactionId:string;
  relatedExternalTransactionId?:string;
  eventType:"authorized"|"captured"|"failed"|"cancelled"|"refunded";
  paymentIntentId:string;
  amountMinor:bigint;
  currency:string;
  occurredAt:string;
  rawMetadata:Record<string,unknown>;
};

export type RefundRequest={
  paymentIntentId:string;
  externalCaptureId:string;
  amountMinor:bigint;
  currency:string;
  idempotencyKey:string;
};

export type RefundResult={
  externalRefundId:string;
  status:"pending"|"refunded";
};

export interface PaymentProviderPort{
  readonly provider:SupportedPaymentProvider;
  assertOrganizationAllowed?(organizationId:string):void;
  createHostedCheckout(input:HostedCheckoutRequest):Promise<HostedCheckoutResult>;
  verifyAndParseWebhook(rawBody:string,headers:Record<string,string|undefined>):Promise<VerifiedWebhookEvent>;
  refund(input:RefundRequest):Promise<RefundResult>;
}
