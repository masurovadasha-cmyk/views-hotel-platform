# Stage 4 — Payments & Double-Entry Ledger

Status: implemented and verified in VIEWS Production Core.

## Delivered

- Payment intents derived from server-side reservation totals
- Hosted-checkout provider contract
- Provider registry that reports only actually connected adapters
- Payment attempts
- Verified webhook inbox
- Provider transaction ledger
- Partial capture support
- Full capture confirmation of booking
- Failed/cancelled provider events
- Refund requests
- Refund worker with lease, retry and exponential backoff
- Late-capture recovery
- Partial-capture recovery after booking hold expiry
- Double-entry accounting journals and entries
- Database-enforced journal balance
- Posted-ledger immutability
- Tenant RLS across payment and ledger tables
- Outbox events for payment and booking state changes
- Raw webhook body preservation for signature verification

## Critical payment flow

Quote -> Booking Hold -> Payment Intent -> Hosted Provider Checkout ->
Verified Provider Webhook -> Provider Transaction -> Balanced Ledger Journal ->
Booking Confirmation

The browser never provides authoritative payment amounts.
PaymentIntentService reads the reservation amount and currency from PostgreSQL.

## Card-data boundary

VIEWS does not accept or persist PAN/CVV.

PaymentProviderPort accepts:
- paymentIntentId
- amountMinor
- currency
- returnUrl
- metadata

and returns a provider-hosted checkout URL / provider reference.

This is intended to minimize PCI scope. Final PCI classification must still be verified with the acquiring/payment provider.

## Provider status

Provider codes supported by the contract:
- payme
- click
- uzum
- octo
- multicard
- stripe

No provider is reported as connected unless an adapter is explicitly registered.

The production core intentionally throws PAYMENT_PROVIDER_NOT_CONNECTED instead of pretending a provider works.

## Webhook safety

Adapters must cryptographically verify the raw webhook body before producing VerifiedWebhookEvent.

The payment core:
- preserves the raw HTTP body for adapter verification
- stores only canonical/sanitized event data plus payload hash
- rejects duplicate event IDs with changed payload
- ignores exact duplicate events
- ignores duplicate provider transactions
- processes events inside tenant-scoped PostgreSQL transactions

## Payment states

Payment intent states include:
- requires_payment
- pending_provider
- authorized
- partially_captured
- captured
- refund_pending
- partially_refunded
- refunded
- failed
- cancelled

A reservation is confirmed only when captured_minor reaches amount_minor.

## Late and partial capture recovery

If funds arrive after the booking hold is no longer valid:

1. the booking is not restored automatically;
2. inventory stays released;
3. the payment intent becomes refund_pending;
4. capture funds are classified as refunds_payable;
5. an idempotent refund request is created;
6. the refund worker submits it through the provider adapter;
7. verified refund webhook settles refunds_payable.

If a partial capture happened before hold expiry and the remaining payment never arrived:

1. booking expiry cancels the hold;
2. PaymentRecoveryService finds captured but unrefunded funds;
3. guest_deposits is reclassified to refunds_payable;
4. a refund request is created for every outstanding provider capture;
5. retry-safe worker processing continues until provider submission succeeds.

Correctness does not depend on an in-memory job.

## Ledger model

Core accounts currently used:

- provider_clearing — asset
- guest_deposits — liability
- refunds_payable — liability

Normal capture:
- Dr provider_clearing
- Cr guest_deposits

Late capture:
- Dr provider_clearing
- Cr refunds_payable

Reclassification after expired partially paid booking:
- Dr guest_deposits
- Cr refunds_payable

Refund:
- Dr guest_deposits OR refunds_payable
- Cr provider_clearing

Revenue recognition is intentionally not performed at payment capture.
Accommodation/service revenue recognition belongs to Folio/Night Audit accounting stages.

## Database guarantees

Migration:
- apps/api/db/migrations/0008_payments_ledger.sql

PostgreSQL enforces:
- unique provider event IDs
- unique provider transactions
- idempotent payment intent creation
- idempotent refund requests
- balanced posted journals
- single-currency journals
- posted ledger immutability
- RLS tenant isolation

## API

GET /v1/payments/providers

Returns only connected provider adapters.

POST /v1/payments/intents

Requires:
- reservationId
- quoteId
- provider
- returnUrl
- Idempotency-Key

The amount is loaded server-side.

POST /v1/payments/webhooks/:provider

The adapter must verify provider signature before the event reaches payment state transitions.

## Refund worker

PaymentRefundWorkerService:
- performs recovery before processing
- claims rows using FOR UPDATE SKIP LOCKED
- uses a lease
- retries failed provider calls
- exponential backoff is bounded
- provider refund request has its own idempotency key

## Local run

1. docker compose -f docker-compose.production-dev.yml up -d
2. Apply migrations 0001 through current production migration chain.
3. Create restricted views_app role per ADR 0002.
4. cd apps/api
5. npm install
6. DATABASE_URL=postgresql://views_app:<password>@localhost:5432/views npm test
7. npm run typecheck
8. npm run build
9. npm run start:dev

## Automated verification

The PostgreSQL 16 integration suite proves:

- no-overbooking still works
- tenant/property RLS still works
- hosted checkout never needs card fields
- payment amount comes from reservation
- payment intent idempotency
- partial capture does not confirm booking
- full capture confirms booking
- exact duplicate webhook is ignored
- reused webhook event ID with changed payload is rejected
- duplicate provider transaction is ignored
- ledger journals balance
- unbalanced posted journal is rejected by PostgreSQL
- posted entries are immutable
- late capture creates durable refund liability
- partial capture followed by hold expiry is recovered
- refund worker submits outstanding captures
- verified refund settles captured amount
- NestJS typecheck passes
- NestJS production build passes

## CHECK before real provider launch

Payme / Click / Uzum / Octo / Multicard:
- official merchant API version
- webhook signature/authentication scheme
- exact amount unit expected by provider
- timeout/retry semantics
- provider-side idempotency guarantees
- refund API and refund status callbacks
- authorization vs immediate capture support
- split-payment capabilities
- settlement timing
- reconciliation/export API
- merchant account requirements
- fiscal receipt interaction

Do not hard-code assumptions until official provider documentation and merchant credentials are available.

## Security checks before public launch

- Replace development identity headers with production authenticated server-derived actor context.
- Store payment provider secrets only in deployment secret storage.
- Rotate webhook secrets.
- Rate-limit payment intent and webhook endpoints.
- Add provider-specific replay windows/timestamp validation.
- Confirm log redaction of provider payloads.
- Confirm Sentry/observability does not receive payment secrets or document PII.
- Complete PCI/acquirer review for hosted checkout architecture.
