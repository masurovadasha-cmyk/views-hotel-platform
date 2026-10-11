# Stage 6 — Data & Analytics Layer 0.6

Status: foundation implementation.

## Architecture

Operational PostgreSQL remains the source of truth.

Analytics is an event-driven projection layer:
- transactional modules emit domain/outbox events;
- analytics consumes relevant outbox rows idempotently;
- projections read the authoritative transactional rows;
- analytical facts are stored separately from transactional tables;
- KPI queries never invent values when source data is absent.

Consumer:
- `analytics-core-v1`

## Fact tables

### analytics_reservation_facts

One current projection per reservation:
- organization
- property
- unit
- reservation status
- currency
- property timezone
- check-in/out timestamps
- local stay dates
- stay nights
- booking timestamp
- lead time
- accommodation revenue
- gross reservation revenue
- source version/update timestamp

### analytics_payment_facts

One current projection per reservation:
- captured amount
- refunded amount
- net collected amount
- currency
- source update timestamp

### analytics_projection_consumptions

Idempotent event-consumption ledger keyed by:
- outbox event
- analytics consumer

This prevents duplicate projection work from changing analytical truth.

## Daily hospitality KPI view

`analytics_property_daily` is a PostgreSQL `security_invoker` view so underlying RLS is enforced.

Dimensions:
- organization
- property
- local date
- currency

Metrics:
- available unit nights
- occupied unit nights
- booking count
- accommodation revenue
- gross revenue
- net revenue
- occupancy
- ADR
- RevPAR
- average lead time
- average stay length

## Revenue allocation

Reservation and payment totals are allocated over stay nights in minor currency units.

Allocation uses integer quotient + remainder distribution so the daily rows sum exactly back to:
- accommodation_minor
- gross_revenue_minor
- net_collected_minor

No fractional minor-unit loss is allowed.

## API

Process projection batch:

`POST /v1/analytics/project?limit=100`

Allowed:
- owner
- manager
- accountant

Read daily KPI:

`GET /v1/analytics/properties/:propertyId/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`

Allowed:
- host
- owner
- manager
- accountant

Property access is checked server-side.

## Event sources

Initial projector responds to:
- reservation aggregate outbox events
- `finance.payment_intent.v1`

The projector uses the outbox event only as a change signal and re-reads the authoritative reservation/payment state.

## RLS / multi-tenant

All analytics fact/consumption tables:
- enable and force PostgreSQL RLS;
- scope by `app.current_organization_id()`.

The KPI view runs with invoker security so it cannot bypass tenant policies through view ownership.

## Automated acceptance

The Stage 6 integration suite verifies:
- outbox-driven projection;
- idempotent consumption;
- source-version reservation facts;
- captured/refunded/net payment facts;
- exact daily minor-unit allocation;
- occupancy;
- ADR;
- RevPAR;
- average lead time;
- average stay length.

The fixture deliberately uses uneven values:
- accommodation = 1001
- gross = 1201
- refund = 201
- net = 1000

Across two nights the sums must remain exactly equal to those source values.

## Next Stage 6 slices

- organization/city/channel/segment dimensions;
- cancellation/no-show metrics;
- booking window cohorts;
- marketplace commission / owner payout net revenue;
- materialized rollups for large date ranges;
- scheduled projection worker with lag/health metrics;
- dashboard API aggregation and caching;
- retention/cohort analytics;
- export/reporting layer.

Do not calculate canonical KPI definitions independently in the UI.
