# Stage 6.3 — Marketplace Economics & Owner Payable Facts

Status: implementation candidate.

## Purpose

Create a truthful marketplace economics boundary for each reservation:

- payment-derived net collected;
- platform commission;
- owner payable;
- taxes withheld;
- other explicit deductions;
- balanced double-entry reclassification;
- analytical platform/owner economics.

This stage creates an **owner payable liability**. It does not claim that the owner has been paid.

## Source of truth

`net_collected_minor` is never supplied by an operator.

It is derived from PostgreSQL payment intents:

`SUM(captured_minor) - SUM(refunded_minor)`

The allocation must satisfy exactly:

`net collected = platform commission + owner payable + taxes withheld + other deductions`

No commission percentage is guessed or hard-coded.

## Snapshot integrity

Migration:

- `0019_marketplace_economics.sql`

Table:

- `reservation_economic_snapshots`

Each draft stores:

- reservation/property/tenant scope;
- currency;
- exact economic components;
- source kind/reference;
- idempotency request hash;
- **payment-state SHA-256 hash**;
- actor attribution.

The payment-state hash includes the ordered payment intent state/version/captured/refunded values.

Draft creation is blocked while payment intents are in transient states such as pending provider,
partial capture, authorization, or refund pending.

## Finalization

Finalization requires:

- role owner or accountant;
- property access;
- reservation in checked-out, cancelled, or no-show state;
- current payment state equals the draft payment-state hash;
- current net collected equals snapshotted net collected;
- reservation guest-deposit ledger balance equals the same net collected amount.

A stale draft fails with:

- `ECONOMICS_PAYMENT_STATE_CHANGED`

A ledger/payment mismatch fails with:

- `ECONOMICS_LEDGER_PAYMENT_MISMATCH`

Finalized snapshots are immutable.

## Double-entry ledger

Finalization posts a balanced journal.

Debit:

- `guest_deposits`

Credits, only when non-zero:

- `platform_commission_revenue`
- `owner_payable`
- `taxes_payable`
- `other_deductions_payable`

The journal is linked to the economics snapshot and is included in the existing finance ledger projection.

This is accounting recognition / liability creation. It is **not** a bank payout.

## Reconciliation

View:

- `reservation_economic_reconciliation`

It compares finalized economics net collected with the latest payment-derived net collected.

States:

- `reconciled`
- `drifted`

This makes later capture/refund drift visible instead of silently changing an immutable finalized snapshot.

## API

Create draft:

`POST /v1/marketplace/economics/reservations/:reservationId/drafts`

Required header:

- `Idempotency-Key`

Required body:

- `platformCommissionMinor`
- `ownerPayableMinor`
- `sourceKind`

Optional:

- `taxesWithheldMinor`
- `otherDeductionsMinor`
- `sourceReference`

Finalize:

`POST /v1/marketplace/economics/:snapshotId/finalize`

Read:

`GET /v1/marketplace/economics/reservations/:reservationId`

Roles:

- draft: owner / manager / accountant
- finalize: owner / accountant
- read: host / owner / manager / accountant

Property scope is enforced server-side.

## Event contract

Finalization emits:

- `marketplace.reservation_economics.v1`

The event is reservation-scoped so the existing `analytics-core-v1` Worker/SLO pipeline consumes it
without creating a second analytics consumer.

## Analytics

Migration:

- `0020_analytics_marketplace_economics.sql`

Fact:

- `analytics_marketplace_economic_facts`

Provenance includes the finalized snapshot ID/version and source kind.

Views:

- `analytics_marketplace_arrival_daily`
- `analytics_marketplace_stay_daily`

Arrival view is for cohort/channel analysis.

Stay-date view allocates every economic component over stay nights using integer quotient + remainder,
so the sum of daily minor units is exactly equal to the finalized snapshot.

Metrics:

- net collected
- platform commission
- owner payable
- taxes withheld
- other deductions
- platform commission rate
- owner payable rate

Missing booking channel/market segment remains NULL.

APIs:

- `GET /v1/analytics/properties/:propertyId/marketplace-economics?from=...&to=...`
- `GET /v1/analytics/properties/:propertyId/marketplace-economics/stay-daily?from=...&to=...`

Both support optional:

- `bookingChannel`
- `marketSegment`

## Still outside this stage

This stage does not:

- initiate owner bank/card payouts;
- mark owner payable as paid;
- implement payout batching;
- reconcile bank statements;
- submit tax remittance;
- assume split-settlement provider contracts.

Those belong to the payout/settlement execution layer.

## Automated acceptance

The integration suite verifies:

- payment-derived net cannot be overridden;
- allocation must balance exactly;
- idempotency replay is safe;
- payment-state changes invalidate a draft;
- finalize requires closed reservation state;
- guest-deposit ledger must reconcile to payment net;
- economics finalization creates a balanced multi-account journal;
- finalized snapshots are immutable;
- reconciliation reports zero drift;
- analytics consumes the economics event;
- source provenance is retained;
- arrival analytics totals/rates are exact;
- stay-date analytics allocations sum back to the source economics.
