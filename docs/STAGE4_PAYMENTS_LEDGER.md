# Stage 4 — Payments & Double-Entry Ledger

Status: implemented in VIEWS Production Core.

## Delivered

- hosted-checkout payment provider port
- explicit provider registry
- payment intents
- payment attempts
- raw webhook inbox
- provider transaction registry
- partial and full capture state
- idempotent webhook processing
- late-capture detection
- durable refund request queue
- refund worker with lease/retry/backoff
- capture/refund transaction linkage
- double-entry ledger
- guest-deposit liability accounting
- booking confirmation only after full capture
- automatic refund queue when money arrives after hold expiry
- RLS for tenant-owned payment and ledger tables

## Provider status

Runtime adapters are NOT_CONNECTED until real merchant credentials and current provider contracts are supplied.

Supported adapter identifiers:
- payme
- click
- uzum
- octo
- multicard
- stripe

The test suite uses a test-only adapter. It is not registered by the production PaymentsModule.

The production registry returns PAYMENT_PROVIDER_NOT_CONNECTED for providers without a real adapter.

## Card-data boundary

VIEWS does not accept or store:
- PAN
- CVV/CVC
- card expiration
- magnetic-stripe data

The API creates a payment intent and asks the provider adapter for a hosted checkout URL.

Flow:

Quote
-> Booking Hold
-> Payment Intent
-> Hosted Provider Page
-> Verified Provider Webhook
-> Provider Transaction
-> Double-Entry Journal
-> Booking Confirmed

## Payment states

requires_payment
-> pending_provider
-> authorized
-> partially_captured
-> captured

Failure branches:
failed
cancelled

Refund branches:
captured / partially_captured
-> refund_pending
-> partially_refunded
-> refunded

## Booking confirmation

A booking is confirmed only when:

captured_minor == amount_minor

Partial capture does not confirm the booking.

When the full capture arrives before the booking hold expires:
- reservation: hold -> confirmed
- inventory_period: payment_hold -> reservation
- booking state event is recorded
- outbox booking.confirmed is emitted

## Late capture

If money arrives after hold expiry or after the reservation was cancelled:

1. the reservation is NOT confirmed
2. blocking inventory is removed
3. the payment is recorded as captured
4. the capture ledger journal is posted
5. payment intent becomes refund_pending
6. a durable payment_refund_request is created
7. payment.refund_required is written to outbox
8. refund worker sends the provider refund
9. verified provider refund webhook posts the reverse journal

This is intentionally durable and retry-safe.

## Refund worker

PaymentRefundWorkerService:
- claims due requests with FOR UPDATE SKIP LOCKED
- commits a short processing lease
- does not hold a DB transaction during provider network calls
- uses exponential backoff
- expired processing leases are reclaimable
- successful provider submission moves the request to submitted
- verified refund webhook moves it to completed

Provider refund idempotency keys are stable.

## Double-entry semantics

Payment capture before stay completion:

Debit: Provider Clearing (asset)
Credit: Guest Deposits (liability)

This is not recognized as accommodation revenue yet.

Refund:

Debit: Guest Deposits (liability)
Credit: Provider Clearing (asset)

Revenue recognition belongs to folio/night-audit/check-out accounting in a later PMS finance stage.

## Database guarantees

Production migration:
apps/api/db/migrations/0008_payments_ledger.sql

Tables:
- payment_intents
- payment_attempts
- payment_webhook_inbox
- payment_refund_requests
- provider_transactions
- ledger_accounts
- ledger_journals
- ledger_entries

Guarantees:
- unique payment intent idempotency per organization
- unique provider event id
- unique provider transaction id + kind
- captured amount cannot exceed intent amount
- refunded amount cannot exceed captured amount
- posted journals are balanced at transaction commit
- posted ledger entries are immutable
- posted journal is immutable
- tenant tables use RLS

## Webhook security

NestJS rawBody is enabled.

A provider adapter must verify the provider signature before returning VerifiedWebhookEvent.

No webhook event is trusted merely because it contains a paymentIntentId.

VerifiedWebhookEvent also provides organizationId from signed/provider-trusted routing metadata so processing can enter the correct RLS tenant context.

## API

GET /v1/payments/providers

Returns only actually registered provider adapters.

POST /v1/payments/intents

Headers:
- Idempotency-Key
- authenticated actor context

Body:
- reservationId
- quoteId
- provider
- returnUrl

Returns:
- paymentIntentId
- amountMinor
- currency
- checkoutUrl
- provider

POST /v1/payments/webhooks/:provider

Requires the raw request body.
Signature handling is provider-specific and belongs in the adapter.

## Automated verification

The Production Core suite verifies:

- migrations 0001–0008 with psql ON_ERROR_STOP=1
- PostgreSQL no-overbooking constraint
- RLS under NOBYPASSRLS views_app
- hosted checkout intent creation
- payment intent idempotency
- partial capture does not confirm booking
- full capture confirms booking
- duplicate webhook event does nothing twice
- duplicate provider transaction does not double-capture
- capture journals are balanced
- posted ledger entries are immutable
- unbalanced posted journal is rejected at commit
- late capture creates refund request
- refund worker submits provider refund
- verified refund reverses payment balance
- refunded intent reaches refunded
- reservation stays cancelled after late capture
- NestJS typecheck
- NestJS production build

## CHECK MANUALLY before live provider activation

For every provider:
- current API version and endpoint contract
- webhook signing algorithm
- merchant onboarding requirements
- checkout expiration semantics
- provider transaction identifiers
- retry rules
- authorization vs capture support
- partial capture support
- partial refund support
- refund webhook availability
- refund SLA
- amount/minor-unit representation for UZS
- fiscal receipt responsibilities
- split-payment / marketplace settlement capability
- PCI scope and hosted-page requirements

Do not enable an adapter until these are confirmed against current official provider documentation and merchant contract.

## Local verification

1. docker compose -f docker-compose.production-dev.yml up -d
2. apply extensions
3. apply migrations 0001 through 0008 with ON_ERROR_STOP=1
4. use restricted views_app DB role
5. cd apps/api
6. npm install
7. DATABASE_URL=postgresql://views_app:<password>@localhost:5432/views npm test
8. npm run typecheck
9. npm run build
