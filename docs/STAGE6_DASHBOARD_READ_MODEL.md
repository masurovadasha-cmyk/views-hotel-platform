# Stage 6.6 — Analytics Dashboard Read Model

Status: implementation candidate.

## Goal

Give CRM/management UI one canonical dashboard response instead of recalculating hospitality and marketplace metrics in the browser.

The dashboard aggregates only existing canonical analytics sources:

- materialized property daily rollups;
- booking arrival cohorts;
- marketplace economics facts/views;
- analytics projection health/SLO;
- property geography.

The UI must not independently recompute Occupancy, ADR, RevPAR, cancellation rates, commission rates, or owner-payable rates.

## Endpoint

`GET /v1/analytics/dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`

Optional:

- `propertyId`

Maximum period:

- 366 days.

Roles:

- host;
- owner;
- manager;
- accountant.

Property scope is enforced server-side.

## Response

Schema version:

- `1`

Main sections:

- `scope`
- `period`
- `freshness`
- `kpisByCurrency`
- `lifecycleByCurrency`
- `marketplaceByCurrency`
- `geography`
- `cache`

### KPI section

Uses materialized property rollups and recomputes weighted:

- available unit nights;
- occupied unit nights;
- booking count;
- accommodation revenue;
- gross revenue;
- net revenue;
- occupancy;
- ADR;
- RevPAR;
- average lead time;
- average stay length.

### Lifecycle section

Uses canonical arrival cohorts:

- booking count;
- active/stayed count;
- cancellation count/rate;
- no-show count/rate;
- average booking lead time;
- average stay length;
- average cancellation lead time.

### Marketplace section

Uses finalized marketplace economic facts:

- net collected;
- platform commission;
- owner payable;
- taxes withheld;
- other deductions;
- commission rate;
- owner-payable rate.

### Geography section

Aggregates accessible property rollups by:

- country;
- region;
- city;
- currency.

## Cache

Migration:

- `0023_analytics_dashboard_cache.sql`

Cache scope includes:

- organization;
- membership;
- optional property;
- date range;
- schema version;
- source fingerprint.

TTL:

- 300 seconds.

Cache rows are protected by FORCE RLS and membership scope.

## Source fingerprint

The fingerprint changes when any of these change:

- accessible property scope;
- materialized rollup freshness;
- reservation-fact projection freshness;
- marketplace-economics projection freshness;
- projection pending-event state;
- projection last processed state;
- worker failure/SLO state.

The accessible property IDs are sorted and hashed into a dedicated scope fingerprint.

This prevents a membership whose property scopes changed from reusing a dashboard cache generated for its previous scope.

## Freshness

The response exposes:

- projection status;
- pending event count;
- oldest pending timestamp;
- last processed timestamp;
- consecutive worker failures;
- last worker error code;
- scope fingerprint;
- rollup refreshed timestamp;
- reservation projected timestamp;
- economics projected timestamp;
- source fingerprint.

A dashboard can therefore distinguish:

- fresh data;
- cached but source-identical data;
- degraded/lagging analytics.

## Cache invalidation behavior

Cache key contains the current source fingerprint.

If transactional projections, rollups, economics, worker health, or membership scope change:

1. the source fingerprint changes;
2. the old cache key no longer matches;
3. the summary is recomputed;
4. a new cache row is stored.

Expired rows are pruned in bounded batches.

## Security

Organization-level dashboard queries still filter each contributing property through:

`app.can_access_property(property_id)`

This applies to:

- KPI aggregation;
- lifecycle cohorts;
- marketplace economics;
- geography.

A membership-scoped cache is never shared across memberships.

## Automated acceptance

Fixture includes:

- materialized hospitality KPI;
- one checked-out reservation;
- one cancelled reservation;
- finalized marketplace economics;
- Tashkent geography.

Acceptance verifies:

- canonical KPI values;
- cancellation rate;
- exact commission/owner-payable economics;
- first request = cache miss;
- second unchanged request = cache hit;
- cache row is membership/property scoped;
- changing rollup freshness changes source fingerprint;
- changed source forces cache miss and updated KPI values.

## Next work

- dashboard channel/segment breakdown blocks;
- cached report/export jobs;
- dashboard ETag/conditional HTTP response;
- period-over-period comparison;
- scheduled snapshot/export delivery.
