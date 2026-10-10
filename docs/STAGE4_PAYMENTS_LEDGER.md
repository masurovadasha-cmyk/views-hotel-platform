# Stage 4 — Payments & Double-Entry Ledger

Status: payment core implemented and verified. Real provider adapters are NOT CONNECTED until official merchant credentials/documentation are supplied.

## Production flow

Quote -> Booking Hold -> Payment Intent -> Provider-hosted Checkout -> Signed Webhook -> Provider Transaction -> Double-entry Ledger -> Booking Confirmation

VIEWS does not accept or persist PAN/CVV.

## Implemented

- Payment intents
- Hosted-checkout provider port
- Provider registry
- Payme / Click / Uzum / Octo / Multicard / Stripe provider identifiers
- Explicit not-connected behavior when no adapter is registered
- Payment attempts
- Idempotent payment-intent creation
- Webhook raw-body boundary
- Provider signature-verification contract
- Unique webhook event IDs
- Payload-hash collision detection
- Unique provider transactions
- Partial captures
- Full capture confirms booking
- Failed/cancelled payment states
- Partial/full refunds
- Durable refund requests
- Retry/lease refund worker
- Late-capture recovery after booking hold expiry
- Double-entry ledger
- Posted journal balance assertion
- Immutable posted ledger entries/journals
- Outbox events for captured/refunded/booking-confirmed/refund-required

## Provider adapter contract

Each adapter must implement:

- createHostedCheckout()
- verifyAndParseWebhook()
- refund()

No provider endpoint, signature algorithm, split-payment behavior or secret name is guessed.

CHECK with provider before implementing each live adapter:
- official merchant API version
- signature verification algorithm
- raw-body requirements
- webhook retry semantics
- transaction identifiers
- authorize vs capture support
- refund and partial-refund support
- split/marketplace settlement support
- currency/minor-unit convention
- checkout expiration behavior

## Ledger model

Core accounts currently used by the payment slice:

- provider_clearing — asset
- guest_deposits — liability
- refunds_payable — liability

Capture:
- Debit provider_clearing
- Credit guest_deposits

Late capture where booking is no longer available:
- Debit provider_clearing
- Credit refunds_payable

Refund of a normal captured guest deposit:
- Debit guest_deposits
- Credit provider_clearing

Refund of late-capture payable:
- Debit refunds_payable
- Credit provider_clearing

Marketplace commission, host payable, taxes payable and revenue recognition are deliberately NOT booked yet. They belong to the marketplace/folio/accounting stages and must not be fabricated prematurely.

## Webhook idempotency

payment_webhook_inbox has UNIQUE(provider, external_event_id).

If the same event ID arrives with the same payload hash:
- response is duplicate
- no second financial effect occurs

If the same event ID arrives with a different payload:
- processing fails with WEBHOOK_EVENT_PAYLOAD_MISMATCH

provider_transactions additionally enforce uniqueness by provider transaction identity.

## Late payment success

A provider may report capture after the booking hold has expired.

Implemented recovery:

1. Record capture transaction.
2. Do NOT resurrect unavailable booking dates.
3. Mark payment refund_pending.
4. Recognize refunds_payable liability.
5. Create durable payment_refund_request.
6. Refund worker calls provider adapter with idempotency key.
7. Verified refund webhook posts reversing ledger entries.
8. Payment becomes refunded/partially_refunded.

This protects inventory correctness even if provider notifications are delayed.

## Refund worker

payment_refund_requests supports:

- pending
- processing lease
- submitted
- completed
- retry after error
- exponential retry delay
- FOR UPDATE SKIP LOCKED claiming

PostgreSQL is the durable source of truth. Redis/BullMQ may later trigger workers but is not required for correctness.

## Database

Migration:
apps/api/db/migrations/0008_payments_ledger.sql

Main tables:
- payment_intents
- payment_attempts
- payment_webhook_inbox
- payment_refund_requests
- provider_transactions
- ledger_accounts
- ledger_journals
- ledger_entries

All tenant-owned payment/ledger tables are protected by RLS and tested using the restricted views_app role.

## Automated verification

VIEWS Production Core currently proves:

- migration chain applies on PostgreSQL 16
- no-overbooking still holds
- tenant/property RLS still holds
- payment intent derives amount from reservation/quote
- hosted checkout receives no card data
- payment-intent idempotency
- partial capture keeps reservation on hold
- full capture confirms booking
- duplicate webhook does not double-book
- webhook payload mismatch is rejected
- duplicate provider transaction does not double-post
- journals balance debit == credit
- unbalanced posted journal is rejected
- posted ledger is immutable
- partial capture + expired hold creates refund recovery
- late full capture creates refunds_payable
- refund worker uses durable requests
- verified refund reverses ledger liability
- NestJS typecheck/build pass

## Local run

1. Start PostgreSQL/Redis:
   docker compose -f docker-compose.production-dev.yml up -d
2. Apply production migrations through 0008.
3. Use restricted views_app DATABASE_URL.
4. cd apps/api
5. npm install
6. npm test
7. npm run typecheck
8. npm run build

## Manual checks before live money

- CHECK: legal acquiring/agent model in Uzbekistan.
- CHECK: marketplace host-payout legal structure before split payments.
- CHECK: fiscal receipt integration.
- CHECK: provider-specific minor units.
- CHECK: provider webhook signature and replay window.
- CHECK: refund SLA and provider retry behavior.
- CHECK: chargeback/dispute API availability.
- CHECK: PCI scope with each hosted-checkout integration.
- CHECK: reconciliation against provider settlement reports.

Do not enable live money until these are confirmed.


## Pages / D1 finance read model

Stage 4 exposes a read-only Finance projection to the Staff UI.

- PostgreSQL payment/ledger tables remain the financial source of truth.
- D1 projection tables cannot initiate checkout, authorize, capture, refund, or mutate provider transactions.
- The Pages API returns `liveMoneyEnabled=false`.
- Amounts are exposed as minor units only; the UI does not guess provider-specific currency decimal conventions.
- Finance access is role/property scoped.
- Front Desk access is rejected.
- Acceptance fails if a projected posted journal is missing entries, spans more than one currency, or has debit != credit.
- Empty projection is valid and is rendered as "not synchronized yet", never as invented revenue.

D1 migration: `migrations/0012_finance_read_model.sql`

Pages endpoint: `GET /api/finance-summary?propertyId=<property>`
