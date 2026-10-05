# Stage 6.3 — Marketplace Economics & Owner Payable Facts

Status: implementation candidate.

## Purpose

Add a truthful economic allocation boundary for marketplace reservations without pretending that
VIEWS already performs legal revenue recognition, split settlement, or owner bank payouts.

This slice answers:

- how much money has actually been collected after refunds;
- how that collected amount is allocated between platform commission, owner payable,
  taxes withheld and other explicit deductions;
- which finalized allocation feeds analytics.

It does not claim that owner payable has been paid.

## Source of truth

`net_collected_minor` is never supplied by an operator.

The service derives it from PostgreSQL payment intents:

`SUM(captured_minor) - SUM(refunded_minor)`

The operator/provider/contract adapter supplies only the allocation components.

The database requires exact equality:

`net collected = platform commission + owner payable + taxes withheld + other deductions`

No guessed percentage is stored.

## Reservation economic snapshots

Migration:

- `0019_marketplace_economics.sql`

Table:

- `reservation_economic_snapshots`

Properties:

- tenant + property + reservation scoped;
- reservation currency enforced by database trigger;
- sequential version per reservation;
- idempotency key + request hash;
- draft/finalized lifecycle;
- at most one finalized snapshot per reservation;
- finalized snapshots are immutable;
- complete actor attribution and audit-log entries.

Sources are explicit:

- manual;
- contract;
- provider.

A source kind does not imply legal correctness. The selected source reference must correspond to
a reviewed contract/provider record before production settlement.

## Finalization safety

A draft may be finalized only when the current payment-derived net collected amount still equals
the amount snapshotted at draft creation.

If captures/refunds change after draft creation, finalization fails with:

- `ECONOMICS_NET_COLLECTED_CHANGED`

The operator must create a new version from the current money state.

Finalization emits:

- `marketplace.reservation_economics.v1`

The event contains exact minor-unit strings and no invented rates.

## API

Create draft:

`POST /v1/marketplace/economics/reservations/:reservationId/drafts`

Required header:

- `Idempotency-Key`

Required body fields:

- `platformCommissionMinor`
- `ownerPayableMinor`
- `sourceKind`

Optional:

- `taxesWithheldMinor`
- `otherDeductionsMinor`
- `sourceReference`

Finalize:

`POST /v1/marketplace/economics/:snapshotId/finalize`

Read reservation economics:

`GET /v1/marketplace/economics/reservations/:reservationId`

Write roles:

- owner
- manager
- accountant

Read roles:

- host
- owner
- manager
- accountant

Property scope remains enforced server-side.

## Analytics

Migration:

- `0020_analytics_marketplace_economics.sql`

Fact table:

- `analytics_marketplace_economic_facts`

Canonical view:

- `analytics_marketplace_arrival_daily`

Dimensions:

- organization;
- property;
- arrival date;
- currency;
- booking channel;
- market segment.

Metrics:

- finalized reservation count;
- net collected;
- platform commission;
- owner payable;
- taxes withheld;
- other deductions;
- platform commission rate;
- owner payable rate.

The view joins the already truthful nullable channel/segment reservation facts. Missing attribution
remains NULL.

Analytics worker/health/SLO is extended so `marketplace.reservation_economics.v1` is a relevant
event for tenant claiming and lag monitoring.

API:

`GET /v1/analytics/properties/:propertyId/marketplace-economics?from=YYYY-MM-DD&to=YYYY-MM-DD`

Optional filters:

- `bookingChannel`
- `marketSegment`

## Important accounting boundary

This stage deliberately does not:

- create a host-payable ledger account;
- recognize accommodation revenue;
- initiate an owner payout;
- call a bank/payment-provider split-settlement API;
- claim tax remittance;
- claim fiscal receipt completion.

Those actions require the final legal/accounting model and provider contracts.

A future accounting/settlement stage may convert a finalized economic snapshot into posted,
balanced journals and payout instructions after those rules are approved.

## Automated acceptance

The test fixture proves:

- payment-derived net collected cannot be overridden;
- an allocation that does not balance exactly is rejected;
- identical idempotency input replays safely;
- changed input under the same idempotency key conflicts;
- payment changes invalidate a stale draft;
- finalized snapshots are immutable;
- finalization emits one exact marketplace event;
- analytics consumes the finalized event;
- commission/owner payable totals and rates are exact.
