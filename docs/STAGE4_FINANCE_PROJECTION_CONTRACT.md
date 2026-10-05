# Stage 4 — Finance Projection Contract v1

Purpose: synchronize the PostgreSQL payments/ledger source of truth into the read-only Pages/D1 finance projection without reconstructing state from partial provider events.

## Event contracts

### finance.payment_snapshot.v1

Produced after a payment intent is created or changes state.

Payload fields:
- schemaVersion = 1
- paymentIntentId
- organizationId
- propertyId
- reservationId
- provider
- status
- amountMinor
- capturedMinor
- refundedMinor
- currency
- sourceVersion
- sourceUpdatedAt

Idempotency key: `finance-payment-projection:<paymentIntentId>:v<sourceVersion>`.

Consumers MUST ignore snapshots whose `sourceVersion` is less than or equal to the version already projected.

### finance.ledger_journal.v1

Produced only for an immutable posted payment ledger journal.

Payload fields:
- schemaVersion = 1
- journalId
- organizationId
- propertyId
- referenceType
- referenceId
- description
- status = posted
- postedAt
- entries[] with accountCode, accountType, side, amountMinor, currency and memo

Before publication the producer verifies:
- at least two entries exist;
- exactly one currency exists;
- total debit equals total credit.

Idempotency key: `finance-ledger-projection:<journalId>:posted`.

## Source-of-truth rule

PostgreSQL remains authoritative. D1 is a read projection only and MUST NOT initiate checkout, authorization, capture, refund, settlement or ledger posting.

## Transport boundary

This contract deliberately separates event production from transport. A later sync worker may consume PostgreSQL outbox rows and apply them to D1. Transport retries must preserve event idempotency and ordering by `sourceVersion` for payment snapshots.

## Privacy / PCI boundary

Projection events contain no PAN, CVV or raw provider secrets.
Amounts remain in minor units.
